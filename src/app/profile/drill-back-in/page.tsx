import type { Metadata } from "next";
import { ProfileSavedListPage } from "@/features/profile/ProfileSavedListPage";
import { requireCurrentPageUserId } from "@/modules/auth";
import { listDrills } from "@/modules/drills/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Drill Back In | Muay Thai Memory" };

export default async function DrillBackInPage() {
  const userId = await requireCurrentPageUserId("/profile/drill-back-in");
  const response = await listDrills(userId, { statusTagSlugs: ["drill-back-in"] });
  return <ProfileSavedListPage title="Drill Back In" drills={response.drills} />;
}
