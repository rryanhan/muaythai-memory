"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { AddDrillSkeleton } from "@/features/drills/AddDrillSkeleton";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import skeletonStyles from "@/components/shared/Skeleton.module.css";
import formStyles from "@/features/drills/DrillForm.module.css";

export default function AddDrillLoading() {
  return (
    <Suspense fallback={<AddDrillLoadingShell onboarding />}>
      <AddDrillLoadingWithRoute />
    </Suspense>
  );
}

function AddDrillLoadingWithRoute() {
  const searchParams = useSearchParams();
  return <AddDrillLoadingShell onboarding={searchParams.get("onboarding") === "1"} />;
}

function AddDrillLoadingShell({ onboarding }: { onboarding: boolean }) {
  return (
    <main className={routeStyles.formPage} aria-label="Loading add drill form">
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <span className="drill-detail-page-back drill-detail-page-back-placeholder" aria-hidden="true">
          ←
        </span>
        <p className="eyebrow">Add Drill</p>
      </header>
      <section className="add-drill-heading" aria-hidden="true">
        <span className={`${skeletonStyles.skeleton} ${formStyles.skeletonHeading}`} />
        <span className={`${skeletonStyles.skeleton} ${formStyles.skeletonSubheading}`} />
      </section>
      <AddDrillSkeleton />
      {!onboarding && <RoutedBottomNav activeView="library" />}
    </main>
  );
}
