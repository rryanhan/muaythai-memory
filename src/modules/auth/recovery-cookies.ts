import type { NextRequest, NextResponse } from "next/server";
import { getCanonicalAppOrigin } from "./request-origin";

export const RECOVERY_INTENT_COOKIE = "mtm-recovery-intent";
export const RECOVERY_GRANT_COOKIE = "mtm-recovery-grant";

export function setRecoveryIntentCookie(
  response: NextResponse,
  token: string,
  request: NextRequest,
): void {
  response.cookies.set(RECOVERY_INTENT_COOKIE, token, {
    httpOnly: true,
    maxAge: 60 * 60,
    path: "/auth/confirm",
    sameSite: "lax",
    secure: isSecureRequest(request),
  });
}

export function clearRecoveryIntentCookie(
  response: NextResponse,
  request: NextRequest,
): void {
  response.cookies.set(RECOVERY_INTENT_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/auth/confirm",
    sameSite: "lax",
    secure: isSecureRequest(request),
  });
}

export function setRecoveryGrantCookie(
  response: NextResponse,
  token: string,
  request: NextRequest,
): void {
  response.cookies.set(RECOVERY_GRANT_COOKIE, token, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(request),
  });
}

export function clearRecoveryGrantCookie(
  response: NextResponse,
  request: NextRequest,
): void {
  response.cookies.set(RECOVERY_GRANT_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(request),
  });
}

export function clearSupabaseAuthCookies(
  response: NextResponse,
  request: NextRequest,
): void {
  for (const cookie of request.cookies.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue;
    response.cookies.set(cookie.name, "", {
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: isSecureRequest(request),
    });
  }
}

function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

function isSecureRequest(request: NextRequest): boolean {
  return new URL(getCanonicalAppOrigin(request)).protocol === "https:";
}
