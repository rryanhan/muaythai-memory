import { NextRequest, NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  clearRecoveryGrantCookie,
  clearSupabaseAuthCookies,
  RECOVERY_GRANT_COOKIE,
} from "@/modules/auth/recovery-cookies";
import {
  performRecoveryPasswordReset,
  type RecoveryResetFailure,
} from "@/modules/auth/recovery-flow";
import { classifyRecoveryPasswordUpdate } from "@/modules/auth/recovery-provider";
import { isSameOriginRequest } from "@/modules/auth/request-origin";
import { getRecoverySessionIdentity } from "@/modules/auth/recovery-session";
import {
  claimRecoveryGrant,
  markRecoveryGrantAmbiguous,
  markRecoveryGrantConsumed,
  markRecoveryGrantKnownFailure,
} from "@/modules/auth/recovery-store";
import { getAuthFlowSecret } from "@/modules/auth/recovery-token";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "The password update could not be accepted." },
      { status: 403 },
    );
  }

  const body = await readJsonBody(request);
  const password = typeof body?.password === "string" ? body.password : "";
  const presentedJti = typeof body?.grantId === "string" ? body.grantId : "";
  const requestedNextPath = safeInternalPath(
    typeof body?.next === "string" ? body.next : null,
  );
  const nextPath = requestedNextPath.startsWith("/auth/reset-password")
    ? "/"
    : requestedNextPath;
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters." },
      { status: 400 },
    );
  }
  if (!presentedJti) {
    return NextResponse.json(
      { error: "This recovery page is no longer active. Request a new recovery link." },
      { status: 403 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const identity = await getRecoverySessionIdentity(supabase);
  const result = await performRecoveryPasswordReset(
    {
      grantToken: request.cookies.get(RECOVERY_GRANT_COOKIE)?.value,
      identity,
      password,
      presentedJti,
      secret: getAuthFlowSecret(),
    },
    {
      claimGrant: claimRecoveryGrant,
      markAmbiguous: markRecoveryGrantAmbiguous,
      markConsumed: markRecoveryGrantConsumed,
      markKnownFailure: markRecoveryGrantKnownFailure,
      async updatePassword(userId, nextPassword) {
        const admin = createSupabaseAdminClient();
        try {
          const { error } = await admin.auth.admin.updateUserById(userId, {
            password: nextPassword,
          });
          return classifyRecoveryPasswordUpdate(error);
        } catch {
          return { certainty: "ambiguous", ok: false };
        }
      },
    },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: getRecoveryFailureMessage(result.reason) },
      { status: getRecoveryFailureStatus(result.reason) },
    );
  }

  // Revoke the recovery session, then remove every local Supabase auth-cookie
  // chunk so a successful reset never turns into an authenticated app session.
  await supabase.auth.signOut({ scope: "local" });

  const signInUrl = new URL("/auth/sign-in", request.nextUrl.origin);
  signInUrl.searchParams.set("next", nextPath);
  signInUrl.searchParams.set("reason", "password-reset");
  const response = NextResponse.json({
    redirectTo: `${signInUrl.pathname}${signInUrl.search}`,
    updated: true,
  });
  clearRecoveryGrantCookie(response, request);
  clearSupabaseAuthCookies(response, request);
  return response;
}

function getRecoveryFailureStatus(reason: RecoveryResetFailure): number {
  if (reason === "expired") return 410;
  if (
    reason === "in-progress"
    || reason === "password-mismatch"
    || reason === "wrong-grant"
  ) return 409;
  if (reason === "provider-error") return 422;
  if (reason === "provider-uncertain" || reason === "state-error") return 503;
  return 403;
}

function getRecoveryFailureMessage(reason: RecoveryResetFailure): string {
  if (reason === "expired") {
    return "This recovery grant has expired. Request a new recovery link.";
  }
  if (reason === "password-mismatch") {
    return "This recovery attempt is already bound to another password. Retry that password or request a new link.";
  }
  if (reason === "in-progress") {
    return "This password update is already processing. Wait a moment, then retry the same password.";
  }
  if (reason === "wrong-grant") {
    return "A newer recovery link replaced this page. Continue in the newer tab or request another link.";
  }
  if (reason === "provider-error") {
    return "The password was rejected. Choose another password and try again.";
  }
  if (reason === "provider-uncertain") {
    return "The password update could not be confirmed. Retry with the same password.";
  }
  if (reason === "state-error") {
    return "Recovery state could not be confirmed. Try again shortly.";
  }
  return "This recovery session is invalid. Request a new recovery link.";
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
