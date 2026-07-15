import { Suspense } from "react";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { CaptureLoadingNav } from "@/features/capture/CaptureLoadingNav";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import skeletonStyles from "@/components/shared/Skeleton.module.css";
import formStyles from "@/features/drills/DrillForm.module.css";

export default function CaptureDraftLoading() {
  return (
    <main className={routeStyles.formPage} aria-label="Loading drill capture">
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <span className="drill-detail-page-back drill-detail-page-back-placeholder" aria-hidden="true">
          ←
        </span>
        <p className="eyebrow">Capture Drill</p>
      </header>
      <section className="add-drill-heading" aria-hidden="true">
        <span className={`${skeletonStyles.skeleton} ${formStyles.skeletonHeading}`} />
        <span className={`${skeletonStyles.skeleton} ${formStyles.skeletonSubheading}`} />
      </section>
      <section className={formStyles.section} aria-hidden="true">
        <span className={`${skeletonStyles.skeleton} ${formStyles.skeletonSectionTitle}`} />
        <span
          className={`${skeletonStyles.skeleton} ${formStyles.skeletonArea} ${formStyles.skeletonAreaTall}`}
        />
      </section>
      <Suspense fallback={<RoutedBottomNav activeView="library" />}>
        <CaptureLoadingNav />
      </Suspense>
    </main>
  );
}
