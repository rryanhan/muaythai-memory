import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { AddDrillSkeleton } from "@/features/drills/AddDrillSkeleton";

export default function EditDrillLoading() {
  return (
    <main className="add-drill-page" aria-label="Loading edit drill form">
      <div className="drill-detail-page-grid" aria-hidden="true" />
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
        <span className="drill-detail-skeleton add-drill-skeleton-heading" />
        <span className="drill-detail-skeleton add-drill-skeleton-subheading" />
      </section>
      <AddDrillSkeleton />
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
