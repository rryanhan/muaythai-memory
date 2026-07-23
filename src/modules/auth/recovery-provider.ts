import type { AuthError } from "@supabase/supabase-js";
import type { RecoveryPasswordUpdateResult } from "./recovery-flow";

export function classifyRecoveryPasswordUpdate(
  error: Pick<AuthError, "code" | "status"> | null,
): RecoveryPasswordUpdateResult {
  if (!error || error.code === "same_password") return { ok: true };

  const known =
    typeof error.status === "number"
    && error.status >= 400
    && error.status < 500
    && error.status !== 408;
  return {
    certainty: known ? "known" : "ambiguous",
    ok: false,
  };
}
