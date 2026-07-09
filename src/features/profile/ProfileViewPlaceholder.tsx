import styles from "./ProfileViewPlaceholder.module.css";

const profileCollections = [
  {
    title: "Favourite Drills",
    count: "3",
    items: ["Slip Right Step-Through Uppercut", "Kick Catch Sweep"],
  },
  {
    title: "Drill Back In",
    count: "3",
    items: ["Technical Defensive Mirror", "Ring Cutting Jab Low Kick"],
  },
];

// Temporary profile surface until profile data and journal uploads become real features.
export function ProfileViewPlaceholder() {
  return (
    <section className={styles.root} aria-label="Profile placeholder">
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden="true">
          RH
        </div>
        <div>
          <p className="eyebrow">Profile</p>
          <h1>Ryan Han</h1>
          <p>31 entries</p>
        </div>
      </header>

      <div className={styles.collections}>
        {profileCollections.map((collection) => (
          <section key={collection.title} className={styles.collection}>
            <div className={styles.collectionHeading}>
              <p>{collection.title}</p>
              <span>{collection.count}</span>
            </div>
            {collection.items.map((item) => (
              <div key={item} className={styles.miniRow}>
                {item}
              </div>
            ))}
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
    </section>
  );
}
