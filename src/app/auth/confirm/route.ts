import { NextRequest, NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOnboardingPath, requireCurrentAppUser } from "@/modules/auth";
import {
  clearRecoveryGrantCookie,
  clearRecoveryIntentCookie,
  RECOVERY_INTENT_COOKIE,
  setRecoveryGrantCookie,
} from "@/modules/auth/recovery-cookies";
import { getPublicRequestOrigin } from "@/modules/auth/request-origin";
import { getRecoverySessionIdentity } from "@/modules/auth/recovery-session";
import { issueRecoveryGrantRecord } from "@/modules/auth/recovery-store";
import {
  createRecoveryGrant,
  getAuthFlowSecret,
  verifyRecoveryIntent,
} from "@/modules/auth/recovery-token";

/**
 * Exchanges Supabase's short-lived PKCE code for a cookie-backed session before
 * protected-route handling sends the user to their original destination.
 */
export async function GET(request: NextRequest) {
  const nextPath = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");
  const requestOrigin = getPublicRequestOrigin(request);
  const recoveryFlow = request.nextUrl.searchParams.get("flow") === "recovery";

  if (!code) {
    return recoveryFlow
      ? recoveryFailureResponse(request, nextPath, requestOrigin)
      : confirmationFailureResponse(nextPath, requestOrigin);
  }

  if (recoveryFlow) {
    return finishRecoveryExchange(request, code, nextPath, requestOrigin);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const redirectType = getExchangeRedirectType(data);
  if (!error && redirectType !== "recovery") {
    const user = await requireCurrentAppUser();
    const safeDestination = nextPath.startsWith("/auth/reset-password") ? "/" : nextPath;
    const destination = getOnboardingPath(user, safeDestination) ?? safeDestination;
    return NextResponse.redirect(new URL(destination, requestOrigin));
  }

  if (!error && redirectType === "recovery") {
    await supabase.auth.signOut({ scope: "local" });
  }
  return confirmationFailureResponse(nextPath, requestOrigin);
}

async function finishRecoveryExchange(
  request: NextRequest,
  code: string,
  nextPath: string,
  requestOrigin: string,
): Promise<NextResponse> {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const intentToken = request.cookies.get(RECOVERY_INTENT_COOKIE)?.value;
  if (!state || !intentToken) {
    return recoveryFailureResponse(request, nextPath, requestOrigin);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || getExchangeRedirectType(data) !== "recovery") {
    await supabase.auth.signOut({ scope: "local" });
    return recoveryFailureResponse(request, nextPath, requestOrigin);
  }

  const identity = await getRecoverySessionIdentity(supabase);
  if (!identity) {
    await supabase.auth.signOut({ scope: "local" });
    return recoveryFailureResponse(request, nextPath, requestOrigin);
  }

  const secret = getAuthFlowSecret();
  const intent = verifyRecoveryIntent(
    intentToken,
    { email: identity.email, state },
    { secret },
  );
  if (!intent.ok) {
    await supabase.auth.signOut({ scope: "local" });
    return recoveryFailureResponse(request, nextPath, requestOrigin);
  }

  try {
    const appUser = await requireCurrentAppUser();
    if (appUser.id !== identity.userId) {
      await supabase.auth.signOut({ scope: "local" });
      return recoveryFailureResponse(request, nextPath, requestOrigin);
    }

    const grant = createRecoveryGrant(
      {
        userId: identity.userId,
        sessionId: identity.sessionId,
      },
      { secret },
    );
    await issueRecoveryGrantRecord({
      expiresAt: grant.expiresAt,
      jtiHash: grant.jtiHash,
      sessionHash: grant.sessionHash,
      userId: identity.userId,
    });

    const resetUrl = new URL("/auth/reset-password", requestOrigin);
    resetUrl.searchParams.set("next", nextPath);
    const response = NextResponse.redirect(resetUrl);
    clearRecoveryIntentCookie(response, request);
    setRecoveryGrantCookie(response, grant.token, request);
    return response;
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    return recoveryFailureResponse(request, nextPath, requestOrigin);
  }
}

function confirmationFailureResponse(nextPath: string, requestOrigin: string): NextResponse {
  const signInUrl = new URL("/auth/sign-in", requestOrigin);
  signInUrl.searchParams.set("next", nextPath);
  signInUrl.searchParams.set("reason", "invalid-link");
  return NextResponse.redirect(signInUrl);
}

function recoveryFailureResponse(
  request: NextRequest,
  nextPath: string,
  requestOrigin: string,
): NextResponse {
  const recoveryUrl = new URL("/auth/forgot-password", requestOrigin);
  recoveryUrl.searchParams.set("next", nextPath);
  recoveryUrl.searchParams.set("reason", "invalid-recovery");
  const response = NextResponse.redirect(recoveryUrl);
  clearRecoveryIntentCookie(response, request);
  clearRecoveryGrantCookie(response, request);
  return response;
}

function getExchangeRedirectType(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("redirectType" in data)) return null;
  return typeof data.redirectType === "string" ? data.redirectType : null;
}
