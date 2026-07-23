import { describe, expect, it, vi } from "vitest";
import { performRecoveryPasswordReset } from "./recovery-flow";
import { createRecoveryGrant } from "./recovery-token";

const SECRET = "test-only-secret-with-more-than-thirty-two-bytes";
const NOW = new Date("2026-07-23T18:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "recovery-session";
type RecoveryDependencies = Parameters<typeof performRecoveryPasswordReset>[1];
type ClaimInput = Parameters<RecoveryDependencies["claimGrant"]>[0];

function grant() {
  return createRecoveryGrant(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
    },
    { now: NOW, secret: SECRET },
  );
}

function input(overrides: Partial<Parameters<typeof performRecoveryPasswordReset>[0]> = {}) {
  const artifact = grant();
  return {
    artifact,
    value: {
      grantToken: artifact.token,
      identity: { sessionId: SESSION_ID, userId: USER_ID },
      now: NOW,
      password: "new-password",
      presentedJti: artifact.jti,
      secret: SECRET,
      ...overrides,
    },
  };
}

function dependencies(
  overrides: Partial<RecoveryDependencies> = {},
): RecoveryDependencies {
  return {
    claimGrant: vi.fn().mockResolvedValue({ grantId: "grant-row", kind: "execute" }),
    markAmbiguous: vi.fn().mockResolvedValue("pending"),
    markConsumed: vi.fn().mockResolvedValue("consumed"),
    markKnownFailure: vi.fn().mockResolvedValue("failed"),
    updatePassword: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe("performRecoveryPasswordReset", () => {
  it("claims durable state, updates the recovered user, then consumes the grant", async () => {
    const order: string[] = [];
    const { value } = input();
    const deps = dependencies({
      claimGrant: vi.fn(async (claimInput: ClaimInput) => {
        order.push("claim");
        expect(claimInput.userId).toBe(USER_ID);
        expect(claimInput.sessionState).toBe("matching");
        return { grantId: "grant-row", kind: "execute" as const };
      }),
      markConsumed: vi.fn(async () => {
        order.push("consume");
        return "consumed" as const;
      }),
      updatePassword: vi.fn(async (userId: string, password: string) => {
        order.push("update");
        expect({ password, userId }).toEqual({ password: "new-password", userId: USER_ID });
        return { ok: true as const };
      }),
    });

    await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
      idempotent: false,
      ok: true,
    });
    expect(order).toEqual(["claim", "update", "consume"]);
  });

  it("rejects an ordinary session, wrong account, expired token, and rotated form before claiming", async () => {
    const cases = [
      {
        expected: "wrong-session",
        override: { identity: { sessionId: "ordinary-session", userId: USER_ID } },
      },
      {
        expected: "wrong-account",
        override: {
          identity: {
            sessionId: SESSION_ID,
            userId: "00000000-0000-4000-8000-000000000002",
          },
        },
      },
      {
        expected: "expired",
        override: { now: new Date("2026-07-23T18:11:00.000Z") },
      },
      {
        expected: "wrong-grant",
        override: { presentedJti: "newer-tab-grant" },
      },
    ] as const;

    for (const testCase of cases) {
      const { value } = input(testCase.override);
      const deps = dependencies();
      await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
        ok: false,
        reason: testCase.expected,
      });
      expect(deps.claimGrant).not.toHaveBeenCalled();
      expect(deps.updatePassword).not.toHaveBeenCalled();
    }
  });

  it("allows a response-lost retry to acknowledge an already-consumed same-password grant", async () => {
    const { value } = input({ identity: null });
    const deps = dependencies({
      claimGrant: vi.fn().mockResolvedValue({ kind: "already-consumed" }),
    });

    await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
      idempotent: true,
      ok: true,
    });
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });

  it("returns a known provider rejection after releasing the safe ledger claim", async () => {
    const { value } = input();
    const deps = dependencies({
      markKnownFailure: vi.fn().mockResolvedValue("failed"),
      updatePassword: vi.fn().mockResolvedValue({ certainty: "known", ok: false }),
    });

    await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
      ok: false,
      reason: "provider-error",
    });
    expect(deps.markKnownFailure).toHaveBeenCalledOnce();
    expect(deps.markAmbiguous).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous provider outcome retryable only through pending state", async () => {
    const { value } = input();
    const deps = dependencies({
      markAmbiguous: vi.fn().mockResolvedValue("pending"),
      updatePassword: vi.fn().mockRejectedValue(new Error("connection ended")),
    });

    await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
      ok: false,
      reason: "provider-uncertain",
    });
    expect(deps.markAmbiguous).toHaveBeenCalledOnce();
  });

  it("keeps the same-password binding when a prior ambiguous outcome exists", async () => {
    const { value } = input();
    const deps = dependencies({
      markKnownFailure: vi.fn().mockResolvedValue("pending"),
      updatePassword: vi.fn().mockResolvedValue({ certainty: "known", ok: false }),
    });

    await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
      ok: false,
      reason: "provider-uncertain",
    });
  });

  it("treats a concurrent successful attempt as success during either failure finalizer", async () => {
    for (const certainty of ["known", "ambiguous"] as const) {
      const { value } = input();
      const deps = dependencies({
        markAmbiguous: vi.fn().mockResolvedValue("consumed"),
        markKnownFailure: vi.fn().mockResolvedValue("consumed"),
        updatePassword: vi.fn().mockResolvedValue({ certainty, ok: false }),
      });

      await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
        idempotent: true,
        ok: true,
      });
    }
  });

  it("reports an uncertain outcome when provider success cannot be durably finalized", async () => {
    const { value } = input();
    const deps = dependencies({
      markConsumed: vi.fn().mockRejectedValue(new Error("database connection ended")),
    });

    await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
      ok: false,
      reason: "provider-uncertain",
    });
  });

  it("does not call the provider when the ledger rejects a different password fingerprint", async () => {
    const { value } = input();
    const deps = dependencies({
      claimGrant: vi.fn().mockResolvedValue({
        kind: "rejected",
        reason: "password-mismatch",
      }),
    });

    await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
      ok: false,
      reason: "password-mismatch",
    });
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });

  it("does not duplicate an active same-password provider request", async () => {
    const { value } = input();
    const deps = dependencies({
      claimGrant: vi.fn().mockResolvedValue({
        kind: "rejected",
        reason: "in-progress",
      }),
    });

    await expect(performRecoveryPasswordReset(value, deps)).resolves.toEqual({
      ok: false,
      reason: "in-progress",
    });
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });
});
