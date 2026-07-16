import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/SignInForm";
import { getMagicLinkFailureMessage } from "@/features/auth/auth-error-messages";
import styles from "@/features/auth/SignIn.module.css";
import { safeInternalPath } from "@/lib/safe-internal-path";

export const metadata: Metadata = {
  title: "Sign in | Muay Thai Memory",
  description: "Sign in to your private Muay Thai training memory.",
};

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;
  const reasonValue = Array.isArray(params.reason) ? params.reason[0] : params.reason;

  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <SignInForm
        nextPath={safeInternalPath(nextValue)}
        initialError={getMagicLinkFailureMessage(reasonValue)}
      />
    </main>
  );
}
