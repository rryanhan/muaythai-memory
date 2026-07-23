import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_GRANT_COOKIE } from "@/modules/auth/recovery-cookies";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getAuthFlowSecret: vi.fn(),
  getRecoverySessionIdentity: vi.fn(),
  performRecoveryPasswordReset: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/modules/auth/recovery-flow", () => ({
  performRecoveryPasswordReset: mocks.performRecoveryPasswordReset,
}));
vi.mock("@/modules/auth/recovery-session", () => ({
  getRecoverySessionIdentity: mocks.getRecoverySessionIdentity,
}));
vi.mock("@/modules/auth/recovery-store", () => ({
  claimRecoveryGrant: vi.fn(),
  markRecoveryGrantAmbiguous: vi.fn(),
  markRecoveryGrantConsumed: vi.fn(),
  markRecoveryGrantKnownFailure: vi.fn(),
}));
vi.mock("@/modules/auth/recovery-token", () => ({
  getAuthFlowSecret: mocks.getAuthFlowSecret,
}));

import { POST } from "./route";

describe("POST /api/auth/recovery/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.example.com");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { signOut: mocks.signOut },
    });
    mocks.getRecoverySessionIdentity.mockResolvedValue({
      email: "fighter@example.com",
      sessionId: "recovery-session",
      userId: "00000000-0000-4000-8000-000000000001",
    });
    mocks.getAuthFlowSecret.mockReturnValue("test-only-secret-with-more-than-thirty-two-bytes");
    mocks.performRecoveryPasswordReset.mockResolvedValue({
      idempotent: false,
      ok: true,
    });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a cross-origin mutation before reading recovery state", async () => {
    const response = await POST(request({ origin: "https://attacker.example" }));

    expect(response.status).toBe(403);
    expect(mocks.performRecoveryPasswordReset).not.toHaveBeenCalled();
  });

  it("rejects spoofed forwarded headers even when Origin matches them", async () => {
    const response = await POST(request({
      extraHeaders: {
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
      origin: "https://attacker.example",
    }));

    expect(response.status).toBe(403);
    expect(mocks.performRecoveryPasswordReset).not.toHaveBeenCalled();
  });

  it("binds the posted form jti, revokes the session, and returns to sign-in", async () => {
    const response = await POST(request());
    const body = await response.json() as { redirectTo: string; updated: boolean };

    expect(mocks.performRecoveryPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        grantToken: "signed-grant",
        password: "new-password",
        presentedJti: "rendered-jti",
      }),
      expect.any(Object),
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(body).toEqual({
      redirectTo: "/auth/sign-in?next=%2Fdrills&reason=password-reset",
      updated: true,
    });

    const clearedNames = response.cookies.getAll().map((cookie) => cookie.name);
    expect(clearedNames).toEqual(expect.arrayContaining([
      RECOVERY_GRANT_COOKIE,
      "sb-project-auth-token",
      "sb-project-auth-token.0",
    ]));
  });

  it("does not clear a newer cookie when an older parallel tab posts its jti", async () => {
    mocks.performRecoveryPasswordReset.mockResolvedValue({
      ok: false,
      reason: "wrong-grant",
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(response.cookies.getAll()).toHaveLength(0);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("never carries an external destination through the sign-in redirect", async () => {
    const response = await POST(request({ next: "https://attacker.example/collect" }));
    const body = await response.json() as { redirectTo: string };

    expect(body.redirectTo).toBe(
      "/auth/sign-in?next=%2F&reason=password-reset",
    );
  });
});

function request({
  extraHeaders = {},
  next = "/drills",
  origin = "https://staging.example.com",
}: {
  extraHeaders?: Record<string, string>;
  next?: string;
  origin?: string;
} = {}): NextRequest {
  return new NextRequest("https://staging.example.com/api/auth/recovery/reset", {
    body: JSON.stringify({
      grantId: "rendered-jti",
      next,
      password: "new-password",
    }),
    headers: {
      cookie: [
        `${RECOVERY_GRANT_COOKIE}=signed-grant`,
        "sb-project-auth-token=session",
        "sb-project-auth-token.0=session-chunk",
      ].join("; "),
      "content-type": "application/json",
      origin,
      ...extraHeaders,
    },
    method: "POST",
  });
}
