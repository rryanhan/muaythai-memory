export type AppView = "network" | "library" | "profile";

type NavItem = {
  id: AppView;
  label: string;
};

const navItems: NavItem[] = [
  { id: "network", label: "Network" },
  { id: "library", label: "Training Log" },
  { id: "profile", label: "Profile" },
];

type BottomNavProps = {
  activeView: AppView;
  onChange: (view: AppView) => void;
};

export function BottomNav({ activeView, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary app views">
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className="bottom-nav-button"
          data-active={activeView === item.id}
          aria-current={activeView === item.id ? "page" : undefined}
          aria-label={item.label}
          onClick={() => onChange(item.id)}
        >
          <span className={`nav-glyph nav-glyph-${item.id}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="sr-only">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
