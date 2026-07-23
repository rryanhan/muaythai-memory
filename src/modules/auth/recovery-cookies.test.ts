import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecoveryGrantCookie,
  clearSupabaseAuthCookies,
  RECOVERY_GRANT_COOKIE,
  setRecoveryGrantCookie,
} from "./recovery-cookies";

describe("recovery cookies", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets the signed recovery grant as a secure server-only cookie", () => {
    const request = new NextRequest("http://internal:3000/auth/confirm", {
      headers: {
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
    });
    const response = NextResponse.json({ ok: true });

    setRecoveryGrantCookie(response, "signed-grant", request);

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${RECOVERY_GRANT_COOKIE}=signed-grant`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
  });

  it("clears the grant and every Supabase auth-cookie chunk after reset", () => {
    const request = new NextRequest("https://staging.example.com/api/auth/recovery/reset", {
      headers: {
        cookie: [
          "sb-project-auth-token=one",
          "sb-project-auth-token.0=two",
          "unrelated-cookie=keep",
        ].join("; "),
      },
      method: "POST",
    });
    const response = NextResponse.json({ ok: true });

    clearRecoveryGrantCookie(response, request);
    clearSupabaseAuthCookies(response, request);

    const cookies = response.cookies.getAll();
    expect(cookies.map((cookie) => cookie.name)).toEqual(expect.arrayContaining([
      RECOVERY_GRANT_COOKIE,
      "sb-project-auth-token",
      "sb-project-auth-token.0",
    ]));
    expect(cookies.some((cookie) => cookie.name === "unrelated-cookie")).toBe(false);
    expect(cookies.every((cookie) => cookie.value === "")).toBe(true);
  });
});
