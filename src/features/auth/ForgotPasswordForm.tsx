"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAuthErrorMessage } from "./auth-error-messages";
import styles from "./SignIn.module.css";

export function ForgotPasswordForm({ nextPath }: { nextPath: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return setError("Enter your email address.");
    setPending(true);
    setError(null);
    const redirectUrl = new URL("/auth/confirm", window.location.origin);
    redirectUrl.searchParams.set("next", `/auth/reset-password?next=${encodeURIComponent(nextPath)}`);
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: redirectUrl.toString(),
    });
    setPending(false);
    if (recoveryError) return setError(getAuthErrorMessage(recoveryError, "recovery"));
    setSent(true);
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <p className="eyebrow">Account Recovery</p>
        <h1>{sent ? "Check your email" : "Reset password"}</h1>
        <p>{sent ? "Use the recovery link to choose a new password." : "We will send one secure recovery link."}</p>
      </header>
      {sent ? (
        <div className={styles.form}>
          <p className={styles.message}>If an account exists for {email.trim().toLowerCase()}, its recovery email is on the way.</p>
          <Link className={styles.secondaryLink} href={`/auth/sign-in?next=${encodeURIComponent(nextPath)}`}>Back to sign in</Link>
        </div>
      ) : (
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <label className={styles.field}>Email<input className={styles.input} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.primary} type="submit" disabled={pending}>{pending ? "Sending..." : "Send recovery link"}</button>
          <Link className={styles.forgotLink} href={`/auth/sign-in?next=${encodeURIComponent(nextPath)}`}>Back to sign in</Link>
        </form>
      )}
    </div>
  );
}
