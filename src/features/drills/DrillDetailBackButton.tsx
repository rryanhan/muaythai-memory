"use client";

import { useRouter } from "next/navigation";
import { useFirstDrillCommit } from "@/features/onboarding/FirstDrillCommitContext";

export function DrillDetailBackButton() {
  const router = useRouter();
  const { committing } = useFirstDrillCommit();

  function goBack() {
    if (committing) return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    router.push("/");
  }

  return (
    <button
      type="button"
      className="drill-detail-page-back"
      aria-label="Go back"
      disabled={committing}
      onClick={goBack}
    >
      <span aria-hidden="true">←</span>
    </button>
  );
}
