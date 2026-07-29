import type { Metadata } from "next";
import { FriendsScreen } from "@/features/friends/FriendsScreen";
import { requireCurrentPageUser } from "@/modules/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "Friends | Muay Thai Memory",
};

export default async function FriendsPage() {
  const user = await requireCurrentPageUser("/friends");
  if (!user.username) throw new Error("Onboarded user is missing a username.");
  return <FriendsScreen currentUsername={user.username} />;
}
