const networkContexts = [
  { label: "Pad Work", className: "context-pad", left: "19%", top: "39%" },
  { label: "Bag Work", className: "context-bag", left: "68%", top: "32%" },
  {
    label: "Partner Drill",
    className: "context-partner",
    left: "43%",
    top: "62%",
  },
  { label: "Clinch", className: "context-clinch", left: "22%", top: "74%" },
  {
    label: "Technical Work",
    className: "context-technical",
    left: "58%",
    top: "50%",
  },
];

const libraryDrills = [
  {
    title: "Slip Right Step-Through Uppercut Exit",
    tags: ["Uppercut", "Slip", "Step Through"],
  },
  {
    title: "Kick Catch Sweep To Angle Reset",
    tags: ["Kick Catch", "Sweep", "Angle"],
  },
  {
    title: "Teep Entry To Right Cross",
    tags: ["Teep", "Cross", "Entry"],
  },
];

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

export function NetworkViewPlaceholder() {
  return (
    <section className="network-view" aria-label="Network view placeholder">
      <div className="network-grid" aria-hidden="true" />
      <div className="network-status-chip">Network shell</div>

      <div className="graph-line graph-line-one" aria-hidden="true" />
      <div className="graph-line graph-line-two" aria-hidden="true" />
      <div className="graph-line graph-line-three" aria-hidden="true" />

      {networkContexts.map((context) => (
        <div
          key={context.label}
          className={`context-node ${context.className}`}
          style={{ left: context.left, top: context.top }}
        >
          <span className="context-node-mark" aria-hidden="true" />
          <span>{context.label}</span>
        </div>
      ))}

      <div className="drill-node drill-node-a">Switch Step Lead Kick</div>
      <div className="drill-node drill-node-b">Parry Jab Cross To Knee</div>
      <div className="drill-node drill-node-c">Shadowboxing Feint Entry</div>

      <div className="network-action-rail" aria-label="Network actions">
        <button type="button" aria-label="Network controls">
          <span className="rail-icon rail-icon-filter" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Search network">
          <span className="rail-icon rail-icon-search" aria-hidden="true" />
        </button>
        <button type="button" className="record-button" aria-label="Record drill">
          <span className="rail-icon rail-icon-record" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

export function LibraryViewPlaceholder() {
  return (
    <section className="library-view" aria-label="Training log placeholder">
      <div className="index-spine" aria-hidden="true" />
      <header className="library-header">
        <p className="eyebrow">Training Log</p>
        <h1>All Drills</h1>
        <p>31 captured drills</p>
        <div className="library-search-row">
          <div className="library-search" aria-label="Search placeholder">
            <span className="search-mark" aria-hidden="true" />
            <span>Search for keyword</span>
          </div>
          <button type="button" aria-label="Filter drills">
            <span className="rail-icon rail-icon-filter" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="library-list" aria-label="Recent drill entries">
        {libraryDrills.map((drill) => (
          <article key={drill.title} className="library-row">
            <p>{drill.tags[0]}</p>
            <h2>{drill.title}</h2>
            <span>{drill.tags.join(" · ")}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ProfileViewPlaceholder() {
  return (
    <section className="profile-view" aria-label="Profile placeholder">
      <header className="profile-header">
        <div className="profile-avatar" aria-hidden="true">
          RH
        </div>
        <div>
          <p className="eyebrow">Profile</p>
          <h1>Ryan Han</h1>
          <p>31 entries</p>
        </div>
      </header>

      <div className="profile-collections">
        {profileCollections.map((collection) => (
          <section key={collection.title} className="profile-collection">
            <div className="profile-collection-heading">
              <p>{collection.title}</p>
              <span>{collection.count}</span>
            </div>
            {collection.items.map((item) => (
              <div key={item} className="profile-mini-row">
                {item}
              </div>
            ))}
            <button type="button">View all</button>
          </section>
        ))}
      </div>

      <section className="journal-placeholder">
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
