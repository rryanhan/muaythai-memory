import { Graph } from "@phosphor-icons/react/Graph";
import { Stack } from "@phosphor-icons/react/Stack";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import styles from "./BottomNav.module.css";

export type AppView = "network" | "library" | "profile";

type NavItem = {
  id: AppView;
  label: string;
  Icon: typeof Graph;
};

const navItems: NavItem[] = [
  { id: "network", label: "Network", Icon: Graph },
  { id: "library", label: "Training Log", Icon: Stack },
  { id: "profile", label: "Profile", Icon: UserCircle },
];

type BottomNavProps = {
  activeView: AppView;
  onChange: (view: AppView) => void;
};

export function BottomNav({ activeView, onChange }: BottomNavProps) {
  return (
    <nav className={`${styles.root} bottom-nav`} aria-label="Primary app views">
      {navItems.map((item) => {
        const isActive = activeView === item.id;

        return (
          <button
            key={item.id}
            type="button"
            className={styles.button}
            data-active={isActive}
            aria-current={isActive ? "page" : undefined}
            aria-label={item.label}
            onClick={() => onChange(item.id)}
          >
            <item.Icon className={styles.glyph} aria-hidden="true" size={28} weight="regular" />
            <span className="sr-only">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
