"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BottomNav, type AppView } from "@/components/navigation/BottomNav";
import { LibraryView } from "@/features/library/LibraryView";
import { NetworkView } from "@/features/network/NetworkView";
import { ProfileViewPlaceholder } from "@/features/profile/ProfileViewPlaceholder";
import type { GraphResponse } from "@/data";
import styles from "./AppShell.module.css";

const viewLabels: Record<AppView, string> = {
  network: "Network",
  library: "Training Log",
  profile: "Profile",
};

type AppShellProps = {
  initialGraph?: GraphResponse;
  initialView?: AppView;
};

export function AppShell({ initialGraph, initialView = "network" }: AppShellProps) {
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState<AppView>(initialView);
  const [networkHasMounted, setNetworkHasMounted] = useState(initialView === "network");
  const [libraryHasMounted, setLibraryHasMounted] = useState(initialView === "library");
  const [profileHasMounted, setProfileHasMounted] = useState(initialView === "profile");

  useEffect(() => {
    const nextView = parseView(searchParams.get("view"));

    if (nextView === "network") setNetworkHasMounted(true);
    if (nextView === "library") setLibraryHasMounted(true);
    if (nextView === "profile") setProfileHasMounted(true);
    setActiveView(nextView);
  }, [searchParams]);

  function changeView(view: AppView) {
    if (view === "network") setNetworkHasMounted(true);
    if (view === "library") setLibraryHasMounted(true);
    if (view === "profile") setProfileHasMounted(true);
    setActiveView(view);
    writeViewToUrl(view);
  }

  return (
    <main className={styles.shell}>
      <div className={styles.screen} aria-label={`${viewLabels[activeView]} view`}>
        {/* Keep mounted views alive so returning to Network does not refetch or reset local graph state. */}
        {networkHasMounted && (
          <div className="app-view-pane" hidden={activeView !== "network"}>
            <NetworkView initialGraph={initialGraph} />
          </div>
        )}
        {libraryHasMounted && (
          <div className="app-view-pane" hidden={activeView !== "library"}>
            <LibraryView />
          </div>
        )}
        {profileHasMounted && (
          <div className="app-view-pane" hidden={activeView !== "profile"}>
            <ProfileViewPlaceholder />
          </div>
        )}
      </div>
      <BottomNav activeView={activeView} onChange={changeView} />
    </main>
  );
}

function writeViewToUrl(view: AppView) {
  const path = view === "network" ? "/" : `/?view=${view}`;
  window.history.replaceState(window.history.state, "", path);
}

function parseView(value: string | null): AppView {
  if (value === "library" || value === "profile") return value;
  return "network";
}
