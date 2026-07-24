import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_INTENT_COOKIE } from "@/modules/auth/recovery-cookies";

const mocks = vi.hoisted(() => ({
  createRecoveryIntent: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getAuthFlowSecret: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/modules/auth/recovery-token", () => ({
  createRecoveryIntent: mocks.createRecoveryIntent,
  getAuthFlowSecret: mocks.getAuthFlowSecret,
}));

import { POST } from "./route";

describe("POST /api/auth/recovery/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.example.com");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
    });
    mocks.createRecoveryIntent.mockReturnValue({
      state: "browser-state",
      token: "signed-intent",
    });
    mocks.getAuthFlowSecret.mockReturnValue("test-only-secret-with-more-than-thirty-two-bytes");
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a cross-origin request before calling Supabase", async () => {
    const response = await POST(request("https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("rejects spoofed forwarded headers even when Origin matches them", async () => {
    const response = await POST(request("https://attacker.example", {
      host: "internal:3000",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    }));

    expect(response.status).toBe(403);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("sends the recovery callback to the canonical origin and sets an HttpOnly intent", async () => {
    const response = await POST(request("https://staging.example.com", {
      host: "internal:3000",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "http",
    }));

    expect(response.status).toBe(200);
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "fighter@example.com",
      {
        redirectTo:
          "https://staging.example.com/auth/confirm"
          + "?flow=recovery&state=browser-state&next=%2Fdrills",
      },
    );
    expect(response.cookies.get(RECOVERY_INTENT_COOKIE)?.value).toBe("signed-intent");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
  });

  it("keeps a preview recovery callback and host-only intent on the trusted preview host", async () => {
    vi.stubEnv("VERCEL_BRANCH_URL", "muaythai-git-feature.vercel.app");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_TARGET_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "muaythai-a1b2c3.vercel.app");

    const response = await POST(request(
      "https://muaythai-git-feature.vercel.app",
      {
        host: "internal:3000",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
    ));

    expect(response.status).toBe(200);
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "fighter@example.com",
      {
        redirectTo:
          "https://muaythai-git-feature.vercel.app/auth/confirm"
          + "?flow=recovery&state=browser-state&next=%2Fdrills",
      },
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${RECOVERY_INTENT_COOKIE}=signed-intent`);
    expect(setCookie).toContain("Secure");
    expect(setCookie).not.toMatch(/domain=/i);
  });
});

function request(origin: string, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://internal:3000/api/auth/recovery/request", {
    body: JSON.stringify({
      email: "Fighter@Example.com",
      next: "/drills",
    }),
    headers: {
      "content-type": "application/json",
      origin,
      ...extraHeaders,
    },
    method: "POST",
  });
}
