import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FighterConnectionsScreen } from "@/features/connections/FighterConnectionsScreen";
import { requireCurrentPageUserId } from "@/modules/auth";
import {
  getAuthorizedConnectionPage,
  publicConnectionSectionSchema,
} from "@/modules/connections";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const parsed = profileUsernameSchema.safeParse((await params).username);
  return {
    title: parsed.success
      ? `@${parsed.data} Connections | Muay Thai Memory`
      : "Connections | Muay Thai Memory",
  };
}

export default async function FighterConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const username = profileUsernameSchema.safeParse((await params).username);
  if (!username.success) notFound();
  const section = publicConnectionSectionSchema.catch("followers").parse(
    (await searchParams).tab,
  );
  const currentUserId = await requireCurrentPageUserId(
    `/fighters/${encodeURIComponent(username.data)}/connections?tab=${section}`,
  );
  const page = await getAuthorizedConnectionPage(
    currentUserId,
    username.data,
    section,
    null,
    20,
  );
  if (!page) notFound();
  if (page.owner.id === currentUserId) redirect(`/connections?tab=${section}`);
  return <FighterConnectionsScreen initialPage={page} />;
}
