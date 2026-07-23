import type { AuthError } from "@supabase/supabase-js";

export type AuthFailureReason = "invalid-link";
export type AuthOperation = "sign-in" | "create" | "recovery";

export function getAuthErrorMessage(
  error: Pick<AuthError, "code" | "message" | "status">,
  operation: AuthOperation,
): string {
  if (error.status === 429 || isRateLimitCode(error.code)) {
    return "Too many attempts were made. Wait a while before trying again.";
  }
  if (operation === "sign-in") {
    if (error.code === "email_not_confirmed") return "Confirm your email before signing in.";
    return "The email or password is incorrect.";
  }
  if (error.code === "email_address_invalid") return "Enter a valid email address.";
  if (error.code === "signup_disabled") return "New account creation is currently unavailable.";
  if (operation === "recovery") return "The recovery email could not be sent. Try again shortly.";
  return "The account could not be created. Try again shortly.";
}

export function getAuthLinkFailureMessage(reason: string | null | undefined): string | null {
  if (reason !== "invalid-link") return null;
  return "That confirmation link is invalid or has expired. Start again below.";
}

export function getAuthSuccessMessage(reason: string | null | undefined): string | null {
  if (reason !== "password-reset") return null;
  return "Password updated. Sign in with your new password.";
}

export function getRecoveryLinkFailureMessage(reason: string | null | undefined): string | null {
  if (reason !== "invalid-recovery") return null;
  return "That recovery link is invalid, expired, or already used. Request a new one below.";
}

function isRateLimitCode(code: AuthError["code"]): boolean {
  return code === "over_email_send_rate_limit" || code === "over_request_rate_limit";
}
