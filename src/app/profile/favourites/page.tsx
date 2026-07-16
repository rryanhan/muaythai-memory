import type { Metadata } from "next";
import { ProfileSavedListPage } from "@/features/profile/ProfileSavedListPage";
import { requireCurrentPageUserId } from "@/modules/auth";
import { listDrills } from "@/modules/drills/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Favourite Drills | Muay Thai Memory" };

export default async function FavouriteDrillsPage() {
  const userId = await requireCurrentPageUserId("/profile/favourites");
  const response = await listDrills(userId, { statusTagSlugs: ["starred"] });
  return <ProfileSavedListPage title="Favourite Drills" drills={response.drills} />;
}
