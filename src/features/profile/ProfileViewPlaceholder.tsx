"use client";

import { useQuery } from "@tanstack/react-query";
import { getDrills } from "@/data";
import { SignOutButton } from "@/features/auth/SignOutButton";
import type { CurrentAppUser } from "@/modules/auth";
import styles from "./ProfileViewPlaceholder.module.css";

type ProfileViewPlaceholderProps = {
  currentUser: CurrentAppUser;
};

// Profile data remains intentionally small for this milestone, but every value
// now belongs to the authenticated user instead of a hardcoded demo account.
export function ProfileViewPlaceholder({ currentUser }: ProfileViewPlaceholderProps) {
  const allDrillsQuery = useQuery({
    queryKey: ["drills", "profile", "all"],
    queryFn: ({ signal }) => getDrills({}, { requestInit: { signal } }),
    staleTime: 60 * 1000,
  });
  const favouritesQuery = useQuery({
    queryKey: ["drills", "profile", "starred"],
    queryFn: ({ signal }) =>
      getDrills({ statusTagSlugs: ["starred"] }, { requestInit: { signal } }),
    staleTime: 60 * 1000,
  });
  const drillBackInQuery = useQuery({
    queryKey: ["drills", "profile", "drill-back-in"],
    queryFn: ({ signal }) =>
      getDrills({ statusTagSlugs: ["drill-back-in"] }, { requestInit: { signal } }),
    staleTime: 60 * 1000,
  });
  const collections = [
    { title: "Favourite Drills", response: favouritesQuery.data },
    { title: "Drill Back In", response: drillBackInQuery.data },
  ];
  const entryCount = allDrillsQuery.data?.total;

  return (
    <section className={styles.root} aria-label="Profile">
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden="true">
          {getInitials(currentUser.displayName)}
        </div>
        <div>
          <p className="eyebrow">Profile</p>
          <h1>{currentUser.displayName}</h1>
          <p>{entryCount === undefined ? "Loading entries" : `${entryCount} entries`}</p>
          {currentUser.email && <p className={styles.email}>{currentUser.email}</p>}
        </div>
      </header>

      <div className={styles.collections}>
        {collections.map((collection) => (
          <section key={collection.title} className={styles.collection}>
            <div className={styles.collectionHeading}>
              <p>{collection.title}</p>
              <span>{collection.response?.total ?? "-"}</span>
            </div>
            {(collection.response?.drills.slice(0, 3) ?? []).map((drill) => (
              <div key={drill.id} className={styles.miniRow}>
                {drill.title}
              </div>
            ))}
            {collection.response?.total === 0 && (
              <p className={styles.emptyCollection}>No drills saved here yet.</p>
            )}
            <button type="button">View all</button>
          </section>
        ))}
      </div>

      <section className={styles.journal}>
        <div>
          <p className="eyebrow">Progress Journal</p>
          <h2>Training clips will live here</h2>
          <p>
            Future entries can connect video, captions, and optional drill
            references without turning profile into a settings page.
          </p>
        </div>
      </section>

      <section className={styles.account}>
        <p className="eyebrow">Account</p>
        <SignOutButton className={styles.signOut} errorClassName={styles.signOutError} />
      </section>
    </section>
  );
}

function getInitials(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "F";
}
