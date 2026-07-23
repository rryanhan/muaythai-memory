import { describe, expect, it } from "vitest";
import {
  createRecoveryGrant,
  createRecoveryIntent,
  fingerprintRecoveryPassword,
  hashRecoveryJti,
  hashRecoverySession,
  verifyRecoveryGrant,
  verifyRecoveryGrantIdentity,
  verifyRecoveryIntent,
} from "./recovery-token";

const SECRET = "test-only-secret-with-more-than-thirty-two-bytes";
const NOW = new Date("2026-07-23T18:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("recovery intents", () => {
  it("binds the intent to the submitted email and browser state", () => {
    const intent = createRecoveryIntent("Fighter@Example.com", {
      now: NOW,
      secret: SECRET,
    });

    expect(verifyRecoveryIntent(
      intent.token,
      { email: "fighter@example.com", state: intent.state },
      { now: NOW, secret: SECRET },
    ).ok).toBe(true);
    expect(verifyRecoveryIntent(
      intent.token,
      { email: "other@example.com", state: intent.state },
      { now: NOW, secret: SECRET },
    )).toEqual({ ok: false, reason: "wrong-account" });
    expect(verifyRecoveryIntent(
      intent.token,
      { email: "fighter@example.com", state: "different-state" },
      { now: NOW, secret: SECRET },
    )).toEqual({ ok: false, reason: "invalid" });
    expect(verifyRecoveryIntent(
      intent.token,
      { email: "fighter@example.com", state: intent.state },
      { now: new Date("2026-07-23T19:01:00.000Z"), secret: SECRET },
    )).toEqual({ ok: false, reason: "expired" });
  });
});

describe("recovery grants", () => {
  const grant = createRecoveryGrant(
    {
      sessionId: "recovery-session",
      userId: USER_ID,
    },
    { now: NOW, secret: SECRET },
  );

  it("binds the signed grant, durable hashes, and expiry to one recovery session", () => {
    const verification = verifyRecoveryGrant(
      grant.token,
      { presentedJti: grant.jti },
      { now: NOW, secret: SECRET },
    );

    expect(verification.ok).toBe(true);
    expect(grant.jtiHash).toBe(hashRecoveryJti(grant.jti, SECRET));
    expect(grant.sessionHash).toBe(hashRecoverySession("recovery-session", SECRET));
    expect(grant.expiresAt).toEqual(new Date("2026-07-23T18:10:00.000Z"));
    if (verification.ok) {
      expect(verifyRecoveryGrantIdentity(
        verification.claims,
        { sessionId: "recovery-session", userId: USER_ID },
        SECRET,
      )).toEqual({ ok: true });
    }
  });

  it("rejects a rotated form grant, wrong account, and ordinary session", () => {
    expect(verifyRecoveryGrant(
      grant.token,
      { presentedJti: "a-newer-tab-jti" },
      { now: NOW, secret: SECRET },
    )).toEqual({ ok: false, reason: "wrong-grant" });

    const verification = verifyRecoveryGrant(
      grant.token,
      { presentedJti: grant.jti },
      { now: NOW, secret: SECRET },
    );
    expect(verification.ok).toBe(true);
    if (!verification.ok) return;

    expect(verifyRecoveryGrantIdentity(
      verification.claims,
      {
        sessionId: "recovery-session",
        userId: "00000000-0000-4000-8000-000000000002",
      },
      SECRET,
    )).toEqual({ ok: false, reason: "wrong-account" });
    expect(verifyRecoveryGrantIdentity(
      verification.claims,
      { sessionId: "ordinary-session", userId: USER_ID },
      SECRET,
    )).toEqual({ ok: false, reason: "wrong-session" });
  });

  it("rejects expired, missing, and modified grants", () => {
    const [payload, signature] = grant.token.split(".");
    const changedSignature = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;

    expect(verifyRecoveryGrant(
      grant.token,
      { presentedJti: grant.jti },
      { now: new Date("2026-07-23T18:11:00.000Z"), secret: SECRET },
    )).toEqual({ ok: false, reason: "expired" });
    expect(verifyRecoveryGrant(
      null,
      { presentedJti: grant.jti },
      { now: NOW, secret: SECRET },
    )).toEqual({ ok: false, reason: "missing" });
    expect(verifyRecoveryGrant(
      `${payload}.${changedSignature}`,
      { presentedJti: grant.jti },
      { now: NOW, secret: SECRET },
    )).toEqual({ ok: false, reason: "invalid" });
  });

  it("creates deterministic keyed password fingerprints without retaining plaintext", () => {
    const first = fingerprintRecoveryPassword("new-password-one", grant.jti, SECRET);
    const retry = fingerprintRecoveryPassword("new-password-one", grant.jti, SECRET);
    const different = fingerprintRecoveryPassword("new-password-two", grant.jti, SECRET);
    const anotherGrant = fingerprintRecoveryPassword(
      "new-password-one",
      "different-grant-jti",
      SECRET,
    );

    expect(first).toBe(retry);
    expect(first).not.toBe(different);
    expect(first).not.toBe(anotherGrant);
    expect(first).toHaveLength(64);
    expect(first).not.toContain("new-password-one");
  });
});
