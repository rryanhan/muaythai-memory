import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { AddDrillSkeleton } from "@/features/drills/AddDrillSkeleton";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import skeletonStyles from "@/components/shared/Skeleton.module.css";
import formStyles from "@/features/drills/DrillForm.module.css";

export default function EditDrillLoading() {
  return (
    <main className={routeStyles.formPage} aria-label="Loading edit drill form">
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <button
          type="button"
          className="drill-detail-page-back drill-detail-page-back-placeholder"
          aria-hidden="true"
          tabIndex={-1}
        >
          <span aria-hidden="true">←</span>
        </button>
        <p className="eyebrow">Edit Drill</p>
      </header>
      <section className="add-drill-heading">
        <span className={`${skeletonStyles.skeleton} ${formStyles.skeletonHeading}`} />
        <span className={`${skeletonStyles.skeleton} ${formStyles.skeletonSubheading}`} />
      </section>
      <AddDrillSkeleton />
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
