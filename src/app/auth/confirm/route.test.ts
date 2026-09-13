import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_GRANT_COOKIE } from "@/modules/auth/recovery-cookies";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  cleanupOldRecoveryGrantRecords: vi.fn(),
  createRecoveryGrant: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getAuthFlowSecret: vi.fn(),
  getOnboardingPath: vi.fn(),
  getRecoverySessionIdentity: vi.fn(),
  issueRecoveryGrantRecord: vi.fn(),
  signOut: vi.fn(),
  synchronizeAppUserFromVerifiedAuthUser: vi.fn(),
  verifyRecoveryIntent: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: mocks.after };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/modules/auth/current-user", () => ({
  getOnboardingPath: mocks.getOnboardingPath,
  synchronizeAppUserFromVerifiedAuthUser:
    mocks.synchronizeAppUserFromVerifiedAuthUser,
}));
vi.mock("@/modules/auth/recovery-session", () => ({
  getRecoverySessionIdentity: mocks.getRecoverySessionIdentity,
}));
vi.mock("@/modules/auth/recovery-store", () => ({
  cleanupOldRecoveryGrantRecords: mocks.cleanupOldRecoveryGrantRecords,
  issueRecoveryGrantRecord: mocks.issueRecoveryGrantRecord,
}));
vi.mock("@/modules/auth/recovery-token", () => ({
  createRecoveryGrant: mocks.createRecoveryGrant,
  getAuthFlowSecret: mocks.getAuthFlowSecret,
  verifyRecoveryIntent: mocks.verifyRecoveryIntent,
}));

import { GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const AUTH_USER = {
  email: "fighter@example.com",
  id: USER_ID,
  user_metadata: { full_name: "Nak Muay" },
};
const AUTH_SESSION = { user: AUTH_USER };

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.after.mockImplementation((callback: () => unknown) => {
      mocks.afterCallbacks.push(callback);
    });
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.example.com");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        signOut: mocks.signOut,
      },
    });
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { redirectType: "recovery", session: AUTH_SESSION, user: AUTH_USER },
      error: null,
    });
    mocks.getAuthFlowSecret.mockReturnValue("test-only-secret-with-more-than-thirty-two-bytes");
    mocks.getRecoverySessionIdentity.mockResolvedValue({
      email: "fighter@example.com",
      sessionId: "recovery-session",
      userId: USER_ID,
    });
    mocks.verifyRecoveryIntent.mockReturnValue({ claims: {}, ok: true });
    mocks.synchronizeAppUserFromVerifiedAuthUser.mockResolvedValue({ id: USER_ID });
    mocks.createRecoveryGrant.mockReturnValue({
      expiresAt: new Date("2026-07-23T18:10:00.000Z"),
      jti: "raw-jti",
      jtiHash: "jti-hash",
      sessionHash: "session-hash",
      token: "signed-grant",
    });
    mocks.issueRecoveryGrantRecord.mockResolvedValue(undefined);
    mocks.cleanupOldRecoveryGrantRecords.mockResolvedValue(0);
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reuses the user verified by a successful sign-in exchange", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { redirectType: null, session: AUTH_SESSION, user: AUTH_USER },
      error: null,
    });
    mocks.getOnboardingPath.mockReturnValue(null);

    const response = await GET(
      new NextRequest(
        "https://staging.example.com/auth/confirm?code=pkce-code&next=%2Fdrills",
      ),
    );

    expect(response.headers.get("location")).toBe("https://staging.example.com/drills");
    expect(mocks.createSupabaseServerClient).toHaveBeenCalledOnce();
    expect(mocks.synchronizeAppUserFromVerifiedAuthUser).toHaveBeenCalledOnce();
    expect(mocks.synchronizeAppUserFromVerifiedAuthUser).toHaveBeenCalledWith(AUTH_USER);
    expect(mocks.getRecoverySessionIdentity).not.toHaveBeenCalled();
  });

  it("rejects a sign-in exchange whose session and user identities disagree", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        redirectType: null,
        session: {
          user: { ...AUTH_USER, id: "00000000-0000-4000-8000-000000000002" },
        },
        user: AUTH_USER,
      },
      error: null,
    });

    const response = await GET(
      new NextRequest(
        "https://staging.example.com/auth/confirm?code=pkce-code&next=%2Fdrills",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://staging.example.com/auth/sign-in?next=%2Fdrills&reason=invalid-link",
    );
    expect(mocks.synchronizeAppUserFromVerifiedAuthUser).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
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
    expect(mocks.createSupabaseServerClient).toHaveBeenCalledOnce();
    expect(mocks.synchronizeAppUserFromVerifiedAuthUser).toHaveBeenCalledWith(AUTH_USER);
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.cleanupOldRecoveryGrantRecords).not.toHaveBeenCalled();

    await runAfterCallback();

    expect(mocks.cleanupOldRecoveryGrantRecords).toHaveBeenCalledOnce();
  });

  it("waits for the durable insert before scheduling cleanup or issuing a grant", async () => {
    let finishInsert: (() => void) | undefined;
    mocks.issueRecoveryGrantRecord.mockReturnValue(
      new Promise<void>((resolve) => {
        finishInsert = resolve;
      }),
    );

    const responsePromise = GET(recoveryRequest());
    await vi.waitFor(() => {
      expect(mocks.issueRecoveryGrantRecord).toHaveBeenCalledOnce();
    });

    expect(mocks.after).not.toHaveBeenCalled();
    finishInsert?.();

    const response = await responsePromise;
    expect(response.cookies.get(RECOVERY_GRANT_COOKIE)?.value).toBe("signed-grant");
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it("keeps cleanup rejection from invalidating an issued recovery grant", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.cleanupOldRecoveryGrantRecords.mockRejectedValue(
      new Error("cleanup database unavailable"),
    );

    const response = await GET(recoveryRequest());

    expect(response.headers.get("location")).toBe(
      "https://staging.example.com/auth/reset-password?next=%2Fdrills",
    );
    await expect(runAfterCallback()).resolves.toBeUndefined();
    expect(response.cookies.get(RECOVERY_GRANT_COOKIE)?.value).toBe("signed-grant");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Recovery grant retention cleanup could not complete.",
    );
  });

  it("keeps after registration failure from invalidating an issued recovery grant", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.after.mockImplementationOnce(() => {
      throw new Error("after context unavailable");
    });

    const response = await GET(recoveryRequest());

    expect(response.headers.get("location")).toBe(
      "https://staging.example.com/auth/reset-password?next=%2Fdrills",
    );
    expect(response.cookies.get(RECOVERY_GRANT_COOKIE)?.value).toBe("signed-grant");
    expect(mocks.cleanupOldRecoveryGrantRecords).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Recovery grant retention cleanup could not complete.",
    );
  });

  it("returns a preview callback to the same trusted host with a host-only grant", async () => {
    vi.stubEnv("VERCEL_BRANCH_URL", "muaythai-git-feature.vercel.app");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_TARGET_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "muaythai-a1b2c3.vercel.app");

    const response = await GET(
      recoveryRequest("https://muaythai-git-feature.vercel.app"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://muaythai-git-feature.vercel.app"
        + "/auth/reset-password?next=%2Fdrills",
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${RECOVERY_GRANT_COOKIE}=signed-grant`);
    expect(setCookie).toContain("Secure");
    expect(setCookie).not.toMatch(/domain=/i);
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
    expect(mocks.synchronizeAppUserFromVerifiedAuthUser).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("rejects mismatched recovery identities before synchronizing the app user", async () => {
    mocks.getRecoverySessionIdentity.mockResolvedValue({
      email: "fighter@example.com",
      sessionId: "recovery-session",
      userId: "00000000-0000-4000-8000-000000000002",
    });

    const response = await GET(recoveryRequest());

    expect(response.headers.get("location")).toContain(
      "/auth/forgot-password?next=%2Fdrills&reason=invalid-recovery",
    );
    expect(mocks.synchronizeAppUserFromVerifiedAuthUser).not.toHaveBeenCalled();
    expect(mocks.issueRecoveryGrantRecord).not.toHaveBeenCalled();
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
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.cleanupOldRecoveryGrantRecords).not.toHaveBeenCalled();
  });
});

async function runAfterCallback(): Promise<void> {
  const callback = mocks.afterCallbacks.shift();
  expect(callback).toBeTypeOf("function");
  await callback?.();
}

function recoveryRequest(origin = "http://internal:3000"): NextRequest {
  return new NextRequest(
    `${origin}/auth/confirm`
      + "?flow=recovery&state=browser-state&code=pkce-code&next=%2Fdrills",
    {
      headers: {
        cookie: "mtm-recovery-intent=signed-intent",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
    },
  );
}
