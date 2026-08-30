import type { Metadata } from "next";
import { ConnectionsScreen, type ConnectionsTab } from "@/features/connections/ConnectionsScreen";
import { requireCurrentPageUser } from "@/modules/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "Connections | Muay Thai Memory",
};

const validTabs = new Set<ConnectionsTab>([
  "followers",
  "following",
  "requests",
  "blocked",
]);

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireCurrentPageUser("/connections");
  if (!user.username) throw new Error("Onboarded user is missing a username.");
  const requestedTab = (await searchParams).tab;
  const initialTab = requestedTab && validTabs.has(requestedTab as ConnectionsTab)
    ? requestedTab as ConnectionsTab
    : "followers";
  return <ConnectionsScreen currentUsername={user.username} initialTab={initialTab} />;
}
