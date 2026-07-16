import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import styles from "@/features/journal/Journal.module.css";

export default function NewJournalEntryLoading() {
  return (
    <main className={styles.page} aria-busy="true">
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <span className={styles.back} aria-hidden="true">←</span>
        <p className="eyebrow">Progress Journal</p>
      </header>
      <section className={styles.pageHeading}>
        <span className={styles.skeletonTitle} />
        <span className={styles.skeletonCopy} />
      </section>
      <div className={styles.uploadSkeleton}>
        <span className={styles.skeletonVideo} />
        {Array.from({ length: 3 }).map((_, index) => <span key={index} />)}
      </div>
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
