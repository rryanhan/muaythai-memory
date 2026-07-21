"use client";

import { useMemo, useState } from "react";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./SignIn.module.css";

export function ResetPasswordForm({ nextPath }: { nextPath: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmation) return setError("Passwords do not match.");
    setPending(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setPending(false);
      setError("Your password could not be updated. Request a new recovery link.");
      return;
    }
    window.location.assign(nextPath);
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <p className="eyebrow">Account Recovery</p>
        <h1>New password</h1>
        <p>Choose the password you will use from now on.</p>
      </header>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <PasswordInput label="New password" value={password} visible={visible} onChange={setPassword} onToggle={() => setVisible((value) => !value)} />
        <PasswordInput label="Confirm password" value={confirmation} visible={visible} onChange={setConfirmation} onToggle={() => setVisible((value) => !value)} />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.primary} type="submit" disabled={pending}>{pending ? "Updating..." : "Update password"}</button>
      </form>
    </div>
  );
}

function PasswordInput({ label, value, visible, onChange, onToggle }: { label: string; value: string; visible: boolean; onChange: (value: string) => void; onToggle: () => void }) {
  return (
    <label className={styles.field}>{label}<span className={styles.passwordField}>
      <input className={styles.input} type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={onToggle}>{visible ? <EyeSlash size={20} /> : <Eye size={20} />}</button>
    </span></label>
  );
}
