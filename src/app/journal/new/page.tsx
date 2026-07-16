import type { Metadata } from "next";
import { JournalUploadScreen } from "@/features/journal/JournalUploadScreen";
import { requireCurrentPageUserId } from "@/modules/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "New Journal Entry | Muay Thai Memory" };

export default async function NewJournalEntryPage() {
  await requireCurrentPageUserId("/journal/new");
  return <JournalUploadScreen />;
}
