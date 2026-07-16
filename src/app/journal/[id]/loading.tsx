import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import styles from "@/features/journal/Journal.module.css";

export default function JournalEntryLoading() {
  return (
    <main className={styles.page} aria-busy="true">
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <span className={styles.back} aria-hidden="true">←</span>
        <p className="eyebrow">Progress Journal</p>
      </header>
      <div className={styles.uploadSkeleton}>
        <span className={styles.skeletonVideo} />
        <span />
        <span />
      </div>
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
