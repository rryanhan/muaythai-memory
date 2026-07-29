import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { badgeByIconKey } from "@/components/shared/context-badges";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { DrillDetailBackButton } from "@/features/drills/DrillDetailBackButton";
import { DrillDetailContent } from "@/features/drills/DrillDetailContent";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import { requireCurrentPageUserId } from "@/modules/auth";
import { getSharedDrillById } from "@/modules/sharing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });
const getCachedSharedDrill = cache(getSharedDrillById);

type SharedDrillPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: SharedDrillPageProps): Promise<Metadata> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return { title: "Shared drill not found | Muay Thai Memory" };
  const userId = await requireCurrentPageUserId(`/shared/drills/${parsed.data.id}`);
  const detail = await getCachedSharedDrill(userId, parsed.data.id);
  return {
    title: detail
      ? `${detail.drill.title} | Muay Thai Memory`
      : "Shared drill not found | Muay Thai Memory",
  };
}

export default async function SharedDrillPage({ params }: SharedDrillPageProps) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const userId = await requireCurrentPageUserId(`/shared/drills/${parsed.data.id}`);
  const detail = await getCachedSharedDrill(userId, parsed.data.id);
  if (!detail) notFound();

  return (
    <main className={routeStyles.detailPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <DrillDetailBackButton />
        <p className="eyebrow">Shared Drill</p>
        <Link
          className="drill-detail-page-edit"
          href={`/fighters/${encodeURIComponent(detail.owner.username)}`}
          prefetch
        >
          @{detail.owner.username}
        </Link>
      </header>
      <DrillDetailContent drill={detail.drill} badgeByIconKey={badgeByIconKey} />
      <RoutedBottomNav activeView="profile" />
    </main>
  );
}
