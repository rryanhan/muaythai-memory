"use client";

import { useMemo, useState } from "react";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { GoogleLogo } from "@phosphor-icons/react/GoogleLogo";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAuthErrorMessage } from "./auth-error-messages";
import styles from "./SignIn.module.css";

type AuthMode = "sign-in" | "create";

type SignInFormProps = {
  nextPath: string;
  initialError?: string | null;
};

export function SignInForm({ nextPath, initialError = null }: SignInFormProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [confirmationSent, setConfirmationSent] = useState(false);

  function confirmUrl() {
    const url = new URL("/auth/confirm", window.location.origin);
    url.searchParams.set("next", nextPath);
    return url.toString();
  }

  async function continueWithGoogle() {
    setPending("google");
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: confirmUrl() },
    });
    if (oauthError) {
      setPending(null);
      setError("Google sign-in could not be started. Try again.");
    }
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return setError("Enter your email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");

    setPending("email");
    setError(null);

    if (mode === "sign-in") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) {
        setPending(null);
        setError(getAuthErrorMessage(signInError, "sign-in"));
        return;
      }
      window.location.assign(nextPath);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { emailRedirectTo: confirmUrl() },
    });
    setPending(null);
    if (signUpError) {
      setError(getAuthErrorMessage(signUpError, "create"));
      return;
    }

    setEmail(normalizedEmail);
    if (data.session) {
      window.location.assign(nextPath);
      return;
    }
    setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <div className={styles.panel}>
        <header className={styles.header}>
          <p className="eyebrow">Muay Thai Memory</p>
          <h1>Check your email</h1>
          <p>Confirm {email} once, then use your password whenever you return.</p>
        </header>
        <div className={styles.form}>
          <p className={styles.message}>The confirmation link expires. If it does, create the account again to request a fresh one.</p>
          <button className={styles.secondary} type="button" onClick={() => setConfirmationSent(false)}>
            Change email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <p className="eyebrow">Muay Thai Memory</p>
        <h1>{mode === "sign-in" ? "Enter the lab" : "Create account"}</h1>
        <p>{mode === "sign-in" ? "Open your private training memory." : "Start collecting the drills you want to keep."}</p>
      </header>

      <button
        className={styles.googleButton}
        type="button"
        disabled={pending !== null}
        onClick={() => void continueWithGoogle()}
      >
        <GoogleLogo size={21} weight="bold" aria-hidden="true" />
        {pending === "google" ? "Opening Google..." : "Continue with Google"}
      </button>

      <div className={styles.divider}><span>or continue with email</span></div>

      <div className={styles.modeSwitch} aria-label="Email authentication mode">
        <button type="button" aria-pressed={mode === "sign-in"} onClick={() => changeMode("sign-in")}>Sign In</button>
        <button type="button" aria-pressed={mode === "create"} onClick={() => changeMode("create")}>Create Account</button>
      </div>

      <form className={styles.form} onSubmit={(event) => void submitEmail(event)}>
        <label className={styles.field}>
          Email
          <input
            className={styles.input}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            disabled={pending !== null}
            onChange={(event) => { setEmail(event.target.value); setError(null); }}
          />
        </label>
        <label className={styles.field}>
          Password
          <span className={styles.passwordField}>
            <input
              className={styles.input}
              type={passwordVisible ? "text" : "password"}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={8}
              value={password}
              disabled={pending !== null}
              onChange={(event) => { setPassword(event.target.value); setError(null); }}
            />
            <button type="button" aria-label={passwordVisible ? "Hide password" : "Show password"} onClick={() => setPasswordVisible((value) => !value)}>
              {passwordVisible ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </span>
        </label>

        {mode === "sign-in" && (
          <Link className={styles.forgotLink} href={`/auth/forgot-password?next=${encodeURIComponent(nextPath)}`}>Forgot password?</Link>
        )}
        {mode === "create" && <p className={styles.passwordHint}>Use at least 8 characters. You will verify your email once.</p>}
        {error && <p className={styles.error} role="alert" aria-live="polite">{error}</p>}
        <button className={styles.primary} type="submit" disabled={pending !== null}>
          {pending === "email" ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setError(null);
  }
}
