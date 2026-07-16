import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { JournalEditScreen } from "@/features/journal/JournalEditScreen";
import { requireCurrentPageUserId } from "@/modules/auth";
import { getJournalEntryById } from "@/modules/journal/queries";

export const metadata: Metadata = { title: "Edit Journal Entry | Muay Thai Memory" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function JournalEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fromDrill?: string }>;
}) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const userId = await requireCurrentPageUserId(`/journal/${parsed.data.id}/edit`);
  const entry = await getJournalEntryById(userId, parsed.data.id);
  if (!entry) notFound();
  const fromDrill = z.string().uuid().safeParse((await searchParams).fromDrill);
  return <JournalEditScreen entry={entry} returnDrillId={fromDrill.success ? fromDrill.data : null} />;
}
