"use client";

import { useEffect, useRef, useState } from "react";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import styles from "./SignIn.module.css";

export function ResetPasswordForm({
  grantId,
  nextPath,
  onComplete,
}: {
  grantId: string;
  nextPath: string;
  onComplete?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error || complete) feedbackRef.current?.focus();
  }, [complete, error]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmation) return setError("Passwords do not match.");
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/recovery/reset", {
        body: JSON.stringify({ grantId, next: nextPath, password }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await readResponse(response);
      if (!response.ok) {
        setError(result.error ?? "Your password could not be updated. Request a new recovery link.");
        return;
      }
      setComplete(true);
      if (onComplete) onComplete();
      else window.setTimeout(
        () => window.location.assign(result.redirectTo ?? "/auth/sign-in"),
        700,
      );
    } catch {
      setError("Your password could not be updated. Check your connection and request a new link.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <p className="eyebrow">Account Recovery</p>
        <h1>New password</h1>
        <p>Choose the password you will use from now on.</p>
      </header>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <PasswordInput label="New password" value={password} visible={visible} disabled={pending || complete} onChange={(value) => { setPassword(value); setError(null); }} onToggle={() => setVisible((value) => !value)} />
        <PasswordInput label="Confirm password" value={confirmation} visible={visible} disabled={pending || complete} onChange={(value) => { setConfirmation(value); setError(null); }} onToggle={() => setVisible((value) => !value)} />
        {error && <p ref={feedbackRef} className={styles.error} role="alert" tabIndex={-1}>{error}</p>}
        {complete && <p ref={feedbackRef} className={styles.message} role="status" tabIndex={-1}>Password updated. Returning to sign in...</p>}
        <button className={styles.primary} type="submit" disabled={pending || complete}>{pending ? "Updating..." : complete ? "Updated" : "Update password"}</button>
      </form>
    </div>
  );
}

function PasswordInput({ label, value, visible, disabled, onChange, onToggle }: { label: string; value: string; visible: boolean; disabled: boolean; onChange: (value: string) => void; onToggle: () => void }) {
  return (
    <label className={styles.field}>{label}<span className={styles.passwordField}>
      <input className={styles.input} type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      <button type="button" disabled={disabled} aria-label={visible ? "Hide password" : "Show password"} onClick={onToggle}>{visible ? <EyeSlash size={20} /> : <Eye size={20} />}</button>
    </span></label>
  );
}

async function readResponse(response: Response): Promise<{ error?: string; redirectTo?: string }> {
  try {
    return await response.json() as { error?: string; redirectTo?: string };
  } catch {
    return {};
  }
}
