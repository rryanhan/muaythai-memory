import Link from "next/link";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { LibraryDrillRow } from "@/features/library/LibraryDrillList";
import type { DrillSummary } from "@/data";
import styles from "./ProfileRouteShell.module.css";

type ProfileSavedListPageProps = {
  title: string;
  drills: DrillSummary[];
};

export function ProfileSavedListPage({ title, drills }: ProfileSavedListPageProps) {
  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.header}>
        <Link className={styles.back} href="/?view=profile" aria-label="Back to Profile">←</Link>
        <p className="eyebrow">Profile</p>
      </header>
      <section className={styles.heading}>
        <h1>{title}</h1>
        <p>{drills.length} {drills.length === 1 ? "drill" : "drills"}</p>
      </section>
      {drills.length > 0 ? (
        <div className={styles.list} aria-label={title}>
          {drills.map((drill) => <LibraryDrillRow key={drill.id} drill={drill} />)}
        </div>
      ) : (
        <p className={styles.empty}>No drills are saved in this list yet.</p>
      )}
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}

export function ProfileSavedListLoading({ title }: { title: string }) {
  return (
    <main className={styles.page} aria-label={`Loading ${title}`}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.header}>
        <span className={styles.back} aria-hidden="true">←</span>
        <p className="eyebrow">Profile</p>
      </header>
      <section className={styles.heading}>
        <h1>{title}</h1>
        <p>Loading drills</p>
      </section>
      <div className={styles.list} aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className={styles.loadingRow}><span /><span /></div>
        ))}
      </div>
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
