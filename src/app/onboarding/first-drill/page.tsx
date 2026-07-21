import { redirect } from "next/navigation";
import { GuidedFirstDrillForm } from "@/features/onboarding/GuidedFirstDrillForm";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { isOnboardingComplete, isProfileOnboarded, requireAuthenticatedPageUser } from "@/modules/auth";

export default async function OnboardingFirstDrillPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string; replay?: string }> }) {
  const params = await searchParams;
  const nextPath = safeInternalPath(params.next);
  const initialMode = params.mode === "text" ? "text" : "voice";
  const replay = params.replay === "1";
  const returnParams = new URLSearchParams({ next: nextPath });
  if (initialMode === "text") returnParams.set("mode", "text");
  if (replay) returnParams.set("replay", "1");
  const user = await requireAuthenticatedPageUser(`/onboarding/first-drill?${returnParams.toString()}`);
  if (!isProfileOnboarded(user)) redirect(`/onboarding/profile?next=${encodeURIComponent(nextPath)}`);
  if (isOnboardingComplete(user) && !replay) redirect(nextPath);

  return <GuidedFirstDrillForm initialMode={initialMode} nextPath={nextPath} replay={replay} />;
}
