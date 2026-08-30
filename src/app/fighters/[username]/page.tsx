import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FighterProfileScreen } from "@/features/connections/FighterProfileScreen";
import { requireCurrentPageUserId } from "@/modules/auth";
import { getFighterProfileByUsername } from "@/modules/connections";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FighterPageProps = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({
  params,
}: FighterPageProps): Promise<Metadata> {
  const parsed = profileUsernameSchema.safeParse((await params).username);
  return {
    title: parsed.success
      ? `@${parsed.data} | Muay Thai Memory`
      : "Fighter | Muay Thai Memory",
  };
}

export default async function FighterPage({ params }: FighterPageProps) {
  const { username: rawUsername } = await params;
  const parsed = profileUsernameSchema.safeParse(rawUsername);
  if (!parsed.success) notFound();

  const currentUserId = await requireCurrentPageUserId(
    `/fighters/${encodeURIComponent(parsed.data)}`,
  );
  const fighter = await getFighterProfileByUsername(currentUserId, parsed.data);
  if (!fighter) notFound();
  if (fighter.isSelf) redirect("/?view=profile");

  return <FighterProfileScreen initialFighter={fighter} />;
}
