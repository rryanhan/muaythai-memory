import type { AuthError } from "@supabase/supabase-js";

export type MagicLinkFailureReason = "invalid-link";

/**
 * Supabase error messages are written for developers and can expose details
 * that do not help someone recover. Keep product copy stable by branching on
 * documented error codes and treating unknown failures conservatively.
 */
export function getAuthErrorMessage(
  error: Pick<AuthError, "code" | "message" | "status">,
): string {
  if (error.status === 429 || isRateLimitCode(error.code)) {
    return "Too many sign-in links were requested. Wait a while before trying again.";
  }

  switch (error.code) {
    case "email_address_invalid":
      return "Enter a valid email address.";
    case "email_address_not_authorized":
      return "This email cannot receive sign-in messages yet. Use a project team email or configure custom SMTP.";
    case "signup_disabled":
      return "New account creation is currently unavailable.";
    default:
      return "We couldn't send a sign-in link. Try again shortly.";
  }
}

export function getMagicLinkFailureMessage(reason: string | null | undefined): string | null {
  if (reason !== "invalid-link") return null;
  return "That sign-in link is invalid or has expired. Request a new link and try again.";
}

function isRateLimitCode(code: AuthError["code"]): boolean {
  return code === "over_email_send_rate_limit" || code === "over_request_rate_limit";
}
