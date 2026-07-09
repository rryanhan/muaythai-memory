"use client";

import { useRouter } from "next/navigation";

export function DrillDetailBackButton() {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    router.push("/");
  }

  return (
    <button type="button" className="drill-detail-page-back" aria-label="Go back" onClick={goBack}>
      <span aria-hidden="true">←</span>
    </button>
  );
}
