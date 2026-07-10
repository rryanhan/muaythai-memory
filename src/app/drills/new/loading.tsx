import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { AddDrillSkeleton } from "@/features/drills/AddDrillSkeleton";

export default function AddDrillLoading() {
  return (
    <main className="add-drill-page" aria-label="Loading add drill form">
      <div className="drill-detail-page-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <span className="drill-detail-page-back drill-detail-page-back-placeholder" aria-hidden="true">
          ←
        </span>
        <p className="eyebrow">Add Drill</p>
      </header>
      <section className="add-drill-heading" aria-hidden="true">
        <span className="drill-detail-skeleton add-drill-skeleton-heading" />
        <span className="drill-detail-skeleton add-drill-skeleton-subheading" />
      </section>
      <AddDrillSkeleton />
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
