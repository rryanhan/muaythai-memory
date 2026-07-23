import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";
import { getRecoveryLinkFailureMessage } from "@/features/auth/auth-error-messages";
import styles from "@/features/auth/SignIn.module.css";
import { safeInternalPath } from "@/lib/safe-internal-path";

export const metadata: Metadata = { title: "Reset password | Muay Thai Memory" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeInternalPath(params.next);
  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <ForgotPasswordForm
        nextPath={nextPath}
        initialError={getRecoveryLinkFailureMessage(params.reason)}
      />
    </main>
  );
}
