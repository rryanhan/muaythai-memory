"use client";

import { useSearchParams } from "next/navigation";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";

export function CaptureLoadingNav() {
  const searchParams = useSearchParams();
  const activeView = searchParams.get("from") === "network" ? "network" : "library";

  return <RoutedBottomNav activeView={activeView} />;
}
