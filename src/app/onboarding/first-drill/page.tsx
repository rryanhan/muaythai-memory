import { redirect } from "next/navigation";
import { GuidedFirstDrillForm } from "@/features/onboarding/GuidedFirstDrillForm";
import styles from "@/features/onboarding/Onboarding.module.css";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { isOnboardingComplete, isProfileOnboarded, requireAuthenticatedPageUser } from "@/modules/auth";

export default async function OnboardingFirstDrillPage({ searchParams }: { searchParams: Promise<{ next?: string; replay?: string }> }) {
  const params = await searchParams;
  const nextPath = safeInternalPath(params.next);
  const user = await requireAuthenticatedPageUser(`/onboarding/first-drill?next=${encodeURIComponent(nextPath)}`);
  if (!isProfileOnboarded(user)) redirect(`/onboarding/profile?next=${encodeURIComponent(nextPath)}`);
  if (isOnboardingComplete(user) && params.replay !== "1") redirect(nextPath);

  return <main className={styles.page}><div className="notebook-grid" aria-hidden="true" /><div className={styles.content}>
    <div className={styles.topline}><p className="eyebrow">First Drill Guide</p><span className={styles.progress}>2 / 2</span></div>
    <GuidedFirstDrillForm nextPath={nextPath} />
  </div></main>;
}
