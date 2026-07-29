import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import styles from "@/features/friends/Friends.module.css";

export default function FriendsLoading() {
  return (
    <main className={styles.page} aria-label="Loading Friends">
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <span className={styles.back} aria-hidden="true">←</span>
        <p className="eyebrow">Profile</p>
      </header>
      <section className={styles.heading}>
        <h1>Friends</h1>
        <p>Loading connections</p>
      </section>
      <section className={styles.section}>
        <div className={styles.loadingRows} aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={index}><i /><b /></span>
          ))}
        </div>
      </section>
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
