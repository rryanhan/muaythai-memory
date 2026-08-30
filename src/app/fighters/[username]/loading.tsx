import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import styles from "@/features/connections/Connections.module.css";

export default function FighterLoading() {
  return (
    <main className={styles.page} aria-label="Loading fighter profile">
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <span className={styles.back} aria-hidden="true">←</span>
        <p className="eyebrow">Fighter Profile</p>
      </header>
      <section className={styles.fighterHero}>
        <span className={styles.heroAvatar} aria-hidden="true" />
        <h1>Loading fighter</h1>
        <p>Loading connection</p>
      </section>
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
