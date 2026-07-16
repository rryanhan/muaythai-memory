import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { badgeByIconKey } from "@/components/shared/context-badges";
import { DrillDetailBackButton } from "@/features/drills/DrillDetailBackButton";
import { DrillDetailContent } from "@/features/drills/DrillDetailContent";
import { DrillJournalPreview } from "@/features/journal/DrillJournalPreview";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { getDrillById } from "@/modules/drills/queries";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import { requireCurrentPageUserId } from "@/modules/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const getCachedDrillById = cache(getDrillById);

type DrillDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: DrillDetailPageProps): Promise<Metadata> {
  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return {
      title: "Drill not found | Muay Thai Memory",
    };
  }

  const userId = await requireCurrentPageUserId(`/drills/${parsedParams.data.id}`);
  const drill = await getCachedDrillById(userId, parsedParams.data.id);

  return {
    title: drill ? `${drill.title} | Muay Thai Memory` : "Drill not found | Muay Thai Memory",
    description: drill?.summary.trim() || "A saved Muay Thai drill.",
  };
}

export default async function DrillDetailPage({ params }: DrillDetailPageProps) {
  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    notFound();
  }

  const userId = await requireCurrentPageUserId(`/drills/${parsedParams.data.id}`);
  const drill = await getCachedDrillById(userId, parsedParams.data.id);

  if (!drill) {
    notFound();
  }

  return (
    <main className={routeStyles.detailPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <DrillDetailBackButton />
        <p className="eyebrow">Drill Record</p>
        <Link className="drill-detail-page-edit" href={`/drills/${drill.id}/edit`} prefetch>
          Edit
        </Link>
      </header>
      <DrillDetailContent drill={drill} badgeByIconKey={badgeByIconKey} />
      <DrillJournalPreview drillId={drill.id} />
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
