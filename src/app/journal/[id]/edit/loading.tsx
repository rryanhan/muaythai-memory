import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import styles from "@/features/journal/Journal.module.css";

export default function JournalEditLoading() {
  return (
    <main className={styles.page} aria-busy="true">
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <span className={styles.back} aria-hidden="true">←</span>
        <p className="eyebrow">Edit Journal Entry</p>
      </header>
      <section className={styles.pageHeading}>
        <span className={styles.skeletonTitle} />
        <span className={styles.skeletonCopy} />
      </section>
      <div className={styles.uploadSkeleton}>
        <span className={styles.skeletonVideo} />
        <span /><span /><span />
      </div>
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
