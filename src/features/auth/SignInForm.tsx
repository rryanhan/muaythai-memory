"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAuthErrorMessage } from "./auth-error-messages";
import styles from "./SignIn.module.css";

const RESEND_SECONDS = 60;

type SignInFormProps = {
  nextPath: string;
  initialError?: string | null;
};

export function SignInForm({ nextPath, initialError = null }: SignInFormProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stage, setStage] = useState<"email" | "sent">("email");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function sendLink() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    setPending(true);
    setError(null);
    const confirmUrl = new URL("/auth/confirm", window.location.origin);
    confirmUrl.searchParams.set("next", nextPath);
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: confirmUrl.toString(),
      },
    });
    setPending(false);

    if (sendError) {
      setError(getAuthErrorMessage(sendError));
      return;
    }

    setEmail(normalizedEmail);
    setStage("sent");
    setResendSeconds(RESEND_SECONDS);
  }

  async function resendLink() {
    if (resendSeconds > 0 || pending) return;
    await sendLink();
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <p className="eyebrow">Muay Thai Memory</p>
        <h1>{stage === "email" ? "Enter the lab" : "Check your email"}</h1>
        <p>
          {stage === "email"
            ? "Use a secure email link to open your private training memory."
            : `We sent a sign-in link to ${email}.`}
        </p>
      </header>

      {stage === "email" ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void sendLink();
          }}
        >
          <label className={styles.field}>
            Email
            <input
              className={styles.input}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              disabled={pending}
            />
          </label>
          {error && (
            <p className={styles.error} role="alert" aria-live="polite">
              {error}
            </p>
          )}
          <button className={styles.primary} type="submit" disabled={pending}>
            {pending ? "Sending link..." : "Send sign-in link"}
          </button>
        </form>
      ) : (
        <div className={styles.form}>
          <p className={styles.message}>
            Open the link in that email to continue. You can close this page after signing in.
          </p>
          {error && (
            <p className={styles.error} role="alert" aria-live="polite">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              type="button"
              disabled={pending}
              onClick={() => {
                setStage("email");
                setError(null);
                setResendSeconds(0);
              }}
            >
              Change email
            </button>
            <button
              className={styles.secondary}
              type="button"
              disabled={pending || resendSeconds > 0}
              onClick={() => void resendLink()}
            >
              {pending
                ? "Sending..."
                : resendSeconds > 0
                  ? `Resend in ${resendSeconds}s`
                  : "Resend link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
