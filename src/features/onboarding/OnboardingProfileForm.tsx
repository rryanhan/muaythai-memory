"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboardingProfile } from "@/data/onboarding";
import type { CurrentAppUser } from "@/modules/auth";
import styles from "./Onboarding.module.css";

export function OnboardingProfileForm({ user, nextPath }: { user: CurrentAppUser; nextPath: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(user.username ?? suggestUsername(user.email));
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [location, setLocation] = useState(user.location ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await completeOnboardingProfile({ username, firstName, lastName, location });
      router.replace(`/onboarding/first-drill?next=${encodeURIComponent(nextPath)}`);
      router.refresh();
    } catch (caught) {
      setPending(false);
      setError(caught instanceof Error ? caught.message : "Profile could not be saved. Try again.");
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <section className={styles.fields}>
        <label><span>Username</span><input autoCapitalize="none" autoCorrect="off" autoComplete="username" maxLength={30} value={username} onChange={(event) => setUsername(normalizeUsernameInput(event.target.value))} /></label>
        <p className={styles.privacy}><strong>Public later:</strong> your username will identify you when friend profiles arrive.</p>
        <label><span>First name <small>(optional)</small></span><input autoComplete="given-name" maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
        <label><span>Last name <small>(optional)</small></span><input autoComplete="family-name" maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
        <label><span>Location <small>(optional)</small></span><input autoComplete="address-level2" maxLength={120} placeholder="Vancouver, BC" value={location} onChange={(event) => setLocation(event.target.value)} /></label>
        <p className={styles.privacy}>Your name and location stay private until you choose otherwise.</p>
      </section>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button type="submit" disabled={pending}>{pending ? "Saving..." : "Continue"}</button></div>
    </form>
  );
}

function suggestUsername(email: string | null): string {
  return normalizeUsernameInput(email?.split("@")[0] ?? "fighter").slice(0, 30) || "fighter";
}

function normalizeUsernameInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
}
