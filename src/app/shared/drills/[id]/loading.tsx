import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import detailStyles from "@/features/drills/DrillDetail.module.css";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import skeletonStyles from "@/components/shared/Skeleton.module.css";

export default function SharedDrillLoading() {
  return (
    <main className={routeStyles.detailPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <span className="drill-detail-page-back drill-detail-page-back-placeholder" aria-hidden="true">←</span>
        <p className="eyebrow">Shared Drill</p>
      </header>
      <article
        className={`${detailStyles.content} drill-detail-content drill-detail-loading-content`}
        aria-label="Loading shared drill"
      >
        <div className="drill-detail-title-row">
          <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-loading-badge`} />
          <div className="drill-detail-loading-title-stack">
            <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-skeleton-title`} />
            <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-skeleton-method`} />
          </div>
        </div>
      </article>
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
