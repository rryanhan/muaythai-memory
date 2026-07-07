import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { badgeByIconKey } from "@/components/context-badges";
import { DrillDetailBackButton } from "@/components/drills/DrillDetailBackButton";
import { DrillDetailContent } from "@/components/drills/DrillDetailContent";
import { getDrillById } from "@/modules/drills";

export const dynamic = "force-dynamic";

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

  const drill = await getCachedDrillById(parsedParams.data.id);

  return {
    title: drill ? `${drill.title} | Muay Thai Memory` : "Drill not found | Muay Thai Memory",
    description: drill?.summary ?? "A saved Muay Thai drill.",
  };
}

export default async function DrillDetailPage({ params }: DrillDetailPageProps) {
  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    notFound();
  }

  const drill = await getCachedDrillById(parsedParams.data.id);

  if (!drill) {
    notFound();
  }

  return (
    <main className="drill-detail-page">
      <div className="drill-detail-page-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <DrillDetailBackButton />
        <p className="eyebrow">Drill Record</p>
      </header>
      <DrillDetailContent drill={drill} badgeByIconKey={badgeByIconKey} />
    </main>
  );
}
