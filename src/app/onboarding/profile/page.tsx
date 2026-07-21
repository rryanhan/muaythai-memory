import { redirect } from "next/navigation";
import { OnboardingProfileForm } from "@/features/onboarding/OnboardingProfileForm";
import styles from "@/features/onboarding/Onboarding.module.css";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { isProfileOnboarded, requireAuthenticatedPageUser } from "@/modules/auth";

export default async function OnboardingProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextPath = safeInternalPath((await searchParams).next);
  const user = await requireAuthenticatedPageUser(`/onboarding/profile?next=${encodeURIComponent(nextPath)}`);
  if (isProfileOnboarded(user)) redirect(`/onboarding/first-drill?next=${encodeURIComponent(nextPath)}`);

  return <main className={styles.page}><div className="notebook-grid" aria-hidden="true" /><div className={styles.content}>
    <div className={styles.topline}><p className="eyebrow">Profile Setup</p><span className={styles.progress}>1 / 2</span></div>
    <header className={styles.heading}><h1>Your fighter profile</h1><p>Choose the identity attached to your private training memory.</p></header>
    <OnboardingProfileForm user={user} nextPath={nextPath} />
  </div></main>;
}
