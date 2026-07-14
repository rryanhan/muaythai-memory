import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import detailStyles from "@/features/drills/DrillDetail.module.css";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import skeletonStyles from "@/components/shared/Skeleton.module.css";

export default function DrillDetailLoading() {
  return (
    <main className={routeStyles.detailPage} aria-label="Loading drill record">
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <span className="drill-detail-page-back drill-detail-page-back-placeholder" aria-hidden="true">
          ←
        </span>
        <p className="eyebrow">Drill Record</p>
      </header>

      <article className={`${detailStyles.content} drill-detail-content drill-detail-loading-content`} aria-hidden="true">
        <div className="drill-detail-title-row">
          <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-loading-badge`} />
          <div className="drill-detail-loading-title-stack">
            <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-skeleton-title`} />
            <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-skeleton-method`} />
          </div>
        </div>

        <div className="drill-detail-loading-summary">
          <span className={`${skeletonStyles.skeleton} drill-detail-skeleton`} />
          <span className={`${skeletonStyles.skeleton} drill-detail-skeleton`} />
        </div>

        <div className="drill-detail-tags">
          <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-skeleton-chip`} />
          <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-skeleton-chip`} />
          <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-skeleton-chip`} />
        </div>

        <section className="drill-detail-section">
          <span className={`${skeletonStyles.skeleton} drill-detail-skeleton drill-detail-skeleton-section-title`} />
          <div className="drill-detail-loading-steps">
            <span className={`${skeletonStyles.skeleton} drill-detail-skeleton`} />
            <span className={`${skeletonStyles.skeleton} drill-detail-skeleton`} />
            <span className={`${skeletonStyles.skeleton} drill-detail-skeleton`} />
            <span className={`${skeletonStyles.skeleton} drill-detail-skeleton`} />
          </div>
        </section>
      </article>
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
