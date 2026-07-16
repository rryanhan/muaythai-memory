import type { Metadata } from "next";
import { ProfileEditScreen } from "@/features/profile/ProfileEditScreen";
import { requireCurrentPageUser } from "@/modules/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Edit Profile | Muay Thai Memory" };

export default async function EditProfilePage() {
  const currentUser = await requireCurrentPageUser("/profile/edit");
  return <ProfileEditScreen currentUser={currentUser} />;
}
