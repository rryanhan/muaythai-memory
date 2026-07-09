"use client";

import { useRouter } from "next/navigation";
import { BottomNav, type AppView } from "@/components/navigation/BottomNav";

type RoutedBottomNavProps = {
  activeView: AppView;
};

const viewRoutes: Record<AppView, string> = {
  network: "/",
  library: "/?view=library",
  profile: "/?view=profile",
};

// Used by standalone routes, where the nav needs real URL navigation instead of AppShell state changes.
export function RoutedBottomNav({ activeView }: RoutedBottomNavProps) {
  const router = useRouter();

  return <BottomNav activeView={activeView} onChange={(view) => router.push(viewRoutes[view])} />;
}
