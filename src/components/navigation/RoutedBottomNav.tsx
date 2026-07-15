"use client";

import { useRouter } from "next/navigation";
import { BottomNav, type AppView } from "@/components/navigation/BottomNav";

type RoutedBottomNavProps = {
  activeView: AppView;
  onNavigate?: (destination: string, view: AppView) => void;
};

const viewRoutes: Record<AppView, string> = {
  network: "/",
  library: "/?view=library",
  profile: "/?view=profile",
};

// Used by standalone routes, where the nav needs real URL navigation instead of AppShell state changes.
export function RoutedBottomNav({ activeView, onNavigate }: RoutedBottomNavProps) {
  const router = useRouter();

  return (
    <BottomNav
      activeView={activeView}
      onChange={(view) => {
        const destination = viewRoutes[view];
        if (onNavigate) {
          onNavigate(destination, view);
          return;
        }
        router.push(destination);
      }}
    />
  );
}
