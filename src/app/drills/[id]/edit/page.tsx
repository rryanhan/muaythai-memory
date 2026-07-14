import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { DrillDetailBackButton } from "@/features/drills/DrillDetailBackButton";
import { AddDrillForm } from "@/features/drills/AddDrillForm";
import { getDrillById } from "@/modules/drills/queries";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const getCachedDrillById = cache(getDrillById);

type EditDrillPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: EditDrillPageProps): Promise<Metadata> {
  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return {
      title: "Edit drill | Muay Thai Memory",
    };
  }

  const drill = await getCachedDrillById(parsedParams.data.id);

  return {
    title: drill ? `Edit ${drill.title} | Muay Thai Memory` : "Edit drill | Muay Thai Memory",
    description: "Update a saved Muay Thai drill.",
  };
}

export default async function EditDrillPage({ params }: EditDrillPageProps) {
  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    notFound();
  }

  const drill = await getCachedDrillById(parsedParams.data.id);

  if (!drill) {
    notFound();
  }

  return (
    <main className={routeStyles.formPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <DrillDetailBackButton />
        <p className="eyebrow">Edit Drill</p>
      </header>
      <section className="add-drill-heading">
        <h1>Edit Drill</h1>
        <p>Adjust the steps, notes, tags, and saved-list markers.</p>
      </section>
      <AddDrillForm mode="edit" initialDrill={drill} />
      <RoutedBottomNav activeView="library" />
    </main>
  );
}
