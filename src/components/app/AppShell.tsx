"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { BottomNav, type AppView } from "@/components/navigation/BottomNav";
import { LibraryView } from "@/features/library/LibraryView";
import { NetworkView } from "@/features/network/NetworkView";
import { ProfileView } from "@/features/profile/ProfileView";
import type { GraphResponse } from "@/data";
import type { CurrentAppUser } from "@/modules/auth";
import styles from "./AppShell.module.css";

const viewLabels: Record<AppView, string> = {
  network: "Network",
  library: "Training Log",
  profile: "Profile",
};

type AppShellProps = {
  currentUser: CurrentAppUser;
  initialGraph?: GraphResponse;
  initialView?: AppView;
};

export function AppShell({ currentUser, initialGraph, initialView = "network" }: AppShellProps) {
  const searchParams = useSearchParams();
  const activeView = parseView(searchParams.get("view"));
  const [mountedViews, setMountedViews] = useState<ReadonlySet<AppView>>(
    () => new Set([initialView]),
  );

  if (!mountedViews.has(activeView)) {
    setMountedViews(new Set([...mountedViews, activeView]));
  }

  function changeView(view: AppView) {
    writeViewToUrl(view);
  }

  return (
    <main className={styles.shell}>
      <div className={styles.screen} aria-label={`${viewLabels[activeView]} view`}>
        {/* Keep mounted views alive so returning to Network does not refetch or reset local graph state. */}
        {(mountedViews.has("network") || activeView === "network") && (
          <div className="app-view-pane" hidden={activeView !== "network"}>
            <NetworkView active={activeView === "network"} initialGraph={initialGraph} />
          </div>
        )}
        {(mountedViews.has("library") || activeView === "library") && (
          <div className="app-view-pane" hidden={activeView !== "library"}>
            <LibraryView />
          </div>
        )}
        {(mountedViews.has("profile") || activeView === "profile") && (
          <div className="app-view-pane" hidden={activeView !== "profile"}>
            <ProfileView currentUser={currentUser} />
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
