import { preload } from "react-dom";
import { AppShell } from "@/components/app/AppShell";
import type { AppView } from "@/components/navigation/BottomNav";
import { contextBadgeUrls } from "@/components/shared/context-badges";
import { getInitialNetworkData } from "@/modules/graph/queries";
import { requireCurrentPageUser } from "@/modules/auth/page-user";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const initialView = getInitialView(searchParams ? await searchParams : undefined);
  const user = await requireCurrentPageUser(initialView === "network" ? "/" : `/?view=${initialView}`);
  if (initialView !== "library") preloadContextBadges();
  const initialNetworkData = initialView === "network"
    ? await getSafeInitialNetworkData(user.id)
    : undefined;

  return (
    <AppShell
      currentUser={user}
      initialGraph={initialNetworkData?.graph}
      initialView={initialView}
    />
  );
}

function preloadContextBadges() {
  for (const href of contextBadgeUrls) {
    preload(href, { as: "image", type: "image/svg+xml" });
  }
}

async function getSafeInitialNetworkData(
  userId: string,
): Promise<Awaited<ReturnType<typeof getInitialNetworkData>> | undefined> {
  try {
    return await getInitialNetworkData(userId);
  } catch {
    return undefined;
  }
}

function getInitialView(searchParams: Record<string, string | string[] | undefined> | undefined): AppView {
  const view = searchParams?.view;
  const value = Array.isArray(view) ? view[0] : view;

  if (value === "library" || value === "profile") return value;
  return "network";
}
