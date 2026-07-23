import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_GRANT_COOKIE } from "@/modules/auth/recovery-cookies";

const mocks = vi.hoisted(() => ({
  createRecoveryGrant: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getAuthFlowSecret: vi.fn(),
  getOnboardingPath: vi.fn(),
  getRecoverySessionIdentity: vi.fn(),
  issueRecoveryGrantRecord: vi.fn(),
  requireCurrentAppUser: vi.fn(),
  signOut: vi.fn(),
  verifyRecoveryIntent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/modules/auth", () => ({
  getOnboardingPath: mocks.getOnboardingPath,
  requireCurrentAppUser: mocks.requireCurrentAppUser,
}));
vi.mock("@/modules/auth/recovery-session", () => ({
  getRecoverySessionIdentity: mocks.getRecoverySessionIdentity,
}));
vi.mock("@/modules/auth/recovery-store", () => ({
  issueRecoveryGrantRecord: mocks.issueRecoveryGrantRecord,
}));
vi.mock("@/modules/auth/recovery-token", () => ({
  createRecoveryGrant: mocks.createRecoveryGrant,
  getAuthFlowSecret: mocks.getAuthFlowSecret,
  verifyRecoveryIntent: mocks.verifyRecoveryIntent,
}));

import { GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        signOut: mocks.signOut,
      },
    });
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { redirectType: "recovery" },
      error: null,
    });
    mocks.getAuthFlowSecret.mockReturnValue("test-only-secret-with-more-than-thirty-two-bytes");
    mocks.getRecoverySessionIdentity.mockResolvedValue({
      email: "fighter@example.com",
      sessionId: "recovery-session",
      userId: USER_ID,
    });
    mocks.verifyRecoveryIntent.mockReturnValue({ claims: {}, ok: true });
    mocks.requireCurrentAppUser.mockResolvedValue({ id: USER_ID });
    mocks.createRecoveryGrant.mockReturnValue({
      expiresAt: new Date("2026-07-23T18:10:00.000Z"),
      jti: "raw-jti",
      jtiHash: "jti-hash",
      sessionHash: "session-hash",
      token: "signed-grant",
    });
    mocks.issueRecoveryGrantRecord.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("mints a grant only after an actual recovery exchange and durable insert", async () => {
    const response = await GET(recoveryRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://staging.example.com/auth/reset-password?next=%2Fdrills",
    );
    expect(mocks.issueRecoveryGrantRecord).toHaveBeenCalledWith({
      expiresAt: new Date("2026-07-23T18:10:00.000Z"),
      jtiHash: "jti-hash",
      sessionHash: "session-hash",
      userId: USER_ID,
    });
    expect(response.cookies.get(RECOVERY_GRANT_COOKIE)?.value).toBe("signed-grant");
  });

  it("rejects a successful PKCE exchange whose redirect type is not recovery", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { redirectType: null },
      error: null,
    });

    const response = await GET(recoveryRequest());

    expect(response.headers.get("location")).toContain(
      "/auth/forgot-password?next=%2Fdrills&reason=invalid-recovery",
    );
    expect(mocks.issueRecoveryGrantRecord).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("locally signs out when the exchanged recovery session has no identity", async () => {
    mocks.getRecoverySessionIdentity.mockResolvedValue(null);

    const response = await GET(recoveryRequest());

    expect(response.headers.get("location")).toContain(
      "/auth/forgot-password?next=%2Fdrills&reason=invalid-recovery",
    );
    expect(mocks.issueRecoveryGrantRecord).not.toHaveBeenCalled();
    expect(mocks.signOut.mock.calls).toEqual([[{ scope: "local" }]]);
  });

  it("locally signs out when the recovery intent is invalid", async () => {
    mocks.verifyRecoveryIntent.mockReturnValue({
      ok: false,
      reason: "invalid-signature",
    });

    const response = await GET(recoveryRequest());

    expect(response.headers.get("location")).toContain(
      "/auth/forgot-password?next=%2Fdrills&reason=invalid-recovery",
    );
    expect(mocks.issueRecoveryGrantRecord).not.toHaveBeenCalled();
    expect(mocks.signOut.mock.calls).toEqual([[{ scope: "local" }]]);
  });

  it("does not turn a recovery exchange without recovery callback state into sign-in", async () => {
    const request = new NextRequest(
      "https://staging.example.com/auth/confirm?code=pkce-code&next=%2Fdrills",
    );

    const response = await GET(request);

    expect(response.headers.get("location")).toContain(
      "/auth/sign-in?next=%2Fdrills&reason=invalid-link",
    );
    expect(mocks.requireCurrentAppUser).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not set a browser grant when the durable ledger insert fails", async () => {
    mocks.issueRecoveryGrantRecord.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(recoveryRequest());

    expect(response.headers.get("location")).toContain(
      "/auth/forgot-password?next=%2Fdrills&reason=invalid-recovery",
    );
    expect(response.cookies.get(RECOVERY_GRANT_COOKIE)?.value).toBe("");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

function recoveryRequest(): NextRequest {
  return new NextRequest(
    "https://staging.example.com/auth/confirm"
      + "?flow=recovery&state=browser-state&code=pkce-code&next=%2Fdrills",
    {
      headers: {
        cookie: "mtm-recovery-intent=signed-intent",
      },
    },
  );
}
