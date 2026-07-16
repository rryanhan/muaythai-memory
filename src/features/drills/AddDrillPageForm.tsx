"use client";

import { useRouter } from "next/navigation";
import { useJournalUpload } from "@/features/journal/JournalUploadProvider";
import { AddDrillForm } from "./AddDrillForm";

export function AddDrillPageForm({ fromJournal }: { fromJournal: boolean }) {
  const router = useRouter();
  const journalUpload = useJournalUpload();

  if (!fromJournal) return <AddDrillForm />;

  return (
    <AddDrillForm
      onCancel={() => router.replace("/journal/new")}
      onSaveSuccess={(drillId) => {
        journalUpload.setDrillId(drillId);
        router.replace("/journal/new");
        router.refresh();
      }}
    />
  );
}
