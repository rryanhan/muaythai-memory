import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";

export default function DrillDetailLoading() {
  return (
    <main className="drill-detail-page" aria-label="Loading drill record">
      <div className="drill-detail-page-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <span className="drill-detail-page-back drill-detail-page-back-placeholder" aria-hidden="true">
          ←
        </span>
        <p className="eyebrow">Drill Record</p>
      </header>

      <article className="drill-detail-content drill-detail-loading-content" aria-hidden="true">
        <div className="drill-detail-title-row">
          <span className="drill-detail-loading-badge drill-detail-skeleton" />
          <div className="drill-detail-loading-title-stack">
            <span className="drill-detail-skeleton drill-detail-skeleton-title" />
            <span className="drill-detail-skeleton drill-detail-skeleton-method" />
          </div>
        </div>

        <div className="drill-detail-loading-summary">
          <span className="drill-detail-skeleton" />
          <span className="drill-detail-skeleton" />
        </div>

        <div className="drill-detail-tags">
          <span className="drill-detail-skeleton drill-detail-skeleton-chip" />
          <span className="drill-detail-skeleton drill-detail-skeleton-chip" />
          <span className="drill-detail-skeleton drill-detail-skeleton-chip" />
        </div>

        <section className="drill-detail-section">
          <span className="drill-detail-skeleton drill-detail-skeleton-section-title" />
          <div className="drill-detail-loading-steps">
            <span className="drill-detail-skeleton" />
            <span className="drill-detail-skeleton" />
            <span className="drill-detail-skeleton" />
            <span className="drill-detail-skeleton" />
          </div>
        </section>
      </article>
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
