"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./SignIn.module.css";

export function ForgotPasswordForm({
  nextPath,
  initialError = null,
}: {
  nextPath: string;
  initialError?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (sent) successHeadingRef.current?.focus();
  }, [sent]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return setError("Enter your email address.");
    setPending(true);
    setSubmittedEmail(normalizedEmail);
    setError(null);

    try {
      const response = await fetch("/api/auth/recovery/request", {
        body: JSON.stringify({ email: normalizedEmail, next: nextPath }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await readResponse(response);
      if (!response.ok) {
        setSubmittedEmail(null);
        setError(result.error ?? "The recovery email could not be sent. Try again shortly.");
        return;
      }
      setSent(true);
    } catch {
      setSubmittedEmail(null);
      setError("The recovery email could not be sent. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <p className="eyebrow">Account Recovery</p>
        <h1 ref={successHeadingRef} tabIndex={sent ? -1 : undefined}>
          {sent ? "Check your email" : "Reset password"}
        </h1>
        <p>{sent ? "Use the recovery link to choose a new password." : "We will send one secure recovery link."}</p>
      </header>
      {sent ? (
        <div className={styles.form}>
          <p className={styles.message} role="status" aria-live="polite">
            If an account exists for {submittedEmail}, its recovery email is on the way.
          </p>
          <button
            className={styles.secondary}
            type="button"
            onClick={() => {
              setSent(false);
              setSubmittedEmail(null);
              setError(null);
            }}
          >
            Change email
          </button>
          <Link className={styles.secondaryLink} href={`/auth/sign-in?next=${encodeURIComponent(nextPath)}`}>Back to sign in</Link>
        </div>
      ) : (
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <label className={styles.field}>Email<input className={styles.input} type="email" autoComplete="email" value={email} disabled={pending} onChange={(event) => { setEmail(event.target.value); setError(null); }} /></label>
          {error && <p ref={errorRef} className={styles.error} role="alert" tabIndex={-1}>{error}</p>}
          <button className={styles.primary} type="submit" disabled={pending}>{pending ? "Sending..." : "Send recovery link"}</button>
          <Link className={styles.forgotLink} href={`/auth/sign-in?next=${encodeURIComponent(nextPath)}`}>Back to sign in</Link>
        </form>
      )}
    </div>
  );
}

async function readResponse(response: Response): Promise<{ error?: string }> {
  try {
    return await response.json() as { error?: string };
  } catch {
    return {};
  }
}
