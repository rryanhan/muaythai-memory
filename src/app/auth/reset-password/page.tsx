import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";
import styles from "@/features/auth/SignIn.module.css";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RECOVERY_GRANT_COOKIE } from "@/modules/auth/recovery-cookies";
import { getRecoverySessionIdentity } from "@/modules/auth/recovery-session";
import {
  canRenderRecoveryGrant,
  type RecoverySessionState,
} from "@/modules/auth/recovery-store";
import {
  getAuthFlowSecret,
  hashRecoveryJti,
  verifyRecoveryGrant,
  verifyRecoveryGrantIdentity,
} from "@/modules/auth/recovery-token";

export const metadata: Metadata = { title: "Choose password | Muay Thai Memory" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextPath = safeInternalPath((await searchParams).next);
  const supabase = await createSupabaseServerClient();
  const identity = await getRecoverySessionIdentity(supabase);
  const grantToken = (await cookies()).get(RECOVERY_GRANT_COOKIE)?.value;
  const secret = getAuthFlowSecret();
  const grant = verifyRecoveryGrant(grantToken, undefined, { secret });
  if (!grant.ok) {
    redirect(`/auth/forgot-password?next=${encodeURIComponent(nextPath)}&reason=invalid-recovery`);
  }

  let sessionState: RecoverySessionState = "missing";

  if (identity) {
    sessionState = verifyRecoveryGrantIdentity(grant.claims, identity, secret).ok
      ? "matching"
      : "mismatch";
  }

  const canRender = await canRenderRecoveryGrant({
    jtiHash: hashRecoveryJti(grant.claims.jti, secret),
    now: new Date(),
    sessionHash: grant.claims.sessionHash,
    sessionState,
    userId: grant.claims.sub,
  });
  if (!canRender) {
    redirect(`/auth/forgot-password?next=${encodeURIComponent(nextPath)}&reason=invalid-recovery`);
  }

  return <main className={styles.page}><div className="notebook-grid" aria-hidden="true" /><ResetPasswordForm grantId={grant.claims.jti} nextPath={nextPath} /></main>;
}
