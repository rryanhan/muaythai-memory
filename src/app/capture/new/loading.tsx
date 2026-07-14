import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";

import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import skeletonStyles from "@/components/shared/Skeleton.module.css";
import formStyles from "@/features/drills/DrillForm.module.css";

export default function CaptureDraftLoading() {
  return (
    <main className={routeStyles.formPage} aria-label="Loading capture draft">
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <span className="drill-detail-page-back drill-detail-page-back-placeholder" aria-hidden="true">
          ←
        </span>
        <p className="eyebrow">Capture Draft</p>
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
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
