"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOnboardingFirstDrill, skipOnboardingFirstDrill } from "@/data/onboarding";
import { CaptureDraftScreen } from "@/features/capture/CaptureDraftScreen";
import type { CaptureMode } from "@/features/capture/CaptureDraftForm";
import styles from "./Onboarding.module.css";

export function GuidedFirstDrillForm({
  initialMode,
  nextPath,
  replay,
}: {
  initialMode: CaptureMode;
  nextPath: string;
  replay: boolean;
}) {
  const router = useRouter();
  const [coachStep, setCoachStep] = useState<0 | 1 | 2>(0);
  const [coachVisible, setCoachVisible] = useState(initialMode === "voice");
  const [skipPending, setSkipPending] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  function openManualForm() {
    setCoachVisible(false);
    const params = new URLSearchParams({ onboarding: "1", next: nextPath });
    if (replay) params.set("replay", "1");
    router.push(`/drills/new?${params.toString()}`);
  }

  async function skipFirstDrill(): Promise<string | null> {
    if (skipPending) return null;
    setSkipPending(true);
    setSkipError(null);
    try {
      await skipOnboardingFirstDrill();
      return nextPath === "/" ? "/?view=library" : nextPath;
    } catch (error) {
      setSkipPending(false);
      setSkipError(error instanceof Error ? error.message : "The guide could not be skipped.");
      return null;
    }
  }

  return (
    <>
      <CaptureDraftScreen
        initialMode={initialMode}
        origin="library"
        onboarding={{
          createAction: createOnboardingFirstDrill,
          methodCoach: coachVisible
            ? {
                activeStep: coachStep,
                onStepChange: setCoachStep,
                onDismiss: () => setCoachVisible(false),
              }
            : undefined,
          onUseManual: openManualForm,
          onSkipFirstDrill: skipFirstDrill,
        }}
      />
      {skipPending && <p className={styles.onboardingFlowNotice}>Opening Training Log...</p>}
      {skipError && <p className={styles.onboardingFlowError} role="alert">{skipError}</p>}
    </>
  );
}
