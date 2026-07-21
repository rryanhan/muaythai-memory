"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { getDrills, updateJournalEntry, type DrillFilterInput, type JournalEntryDetail } from "@/data";
import { JournalDatePicker } from "./JournalDatePicker";
import { JournalDiscardSheet } from "./JournalDiscardSheet";
import { JournalDrillPicker } from "./JournalDrillPicker";
import { JournalVideoPlayer } from "./JournalVideoPlayer";
import styles from "./Journal.module.css";

const allDrillFilters: DrillFilterInput = {
  keywords: [], methodSlugs: [], tagSlugs: [], statusTagSlugs: [], tagMode: "all", statusMode: "all",
};

export function JournalEditScreen({
  entry,
  returnDrillId,
}: {
  entry: JournalEntryDetail;
  returnDrillId: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [occurredOn, setOccurredOn] = useState(entry.occurredOn);
  const [caption, setCaption] = useState(entry.caption ?? "");
  const [drillId, setDrillId] = useState(entry.drill?.id ?? "");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  const detailHref = returnDrillId ? `/journal/${entry.id}?fromDrill=${returnDrillId}` : `/journal/${entry.id}`;
  const dirty = occurredOn !== entry.occurredOn || caption !== (entry.caption ?? "") || drillId !== (entry.drill?.id ?? "");
  const drillsQuery = useQuery({
    queryKey: ["drills", allDrillFilters],
    queryFn: ({ signal }) => getDrills(allDrillFilters, { requestInit: { signal } }),
    staleTime: 60 * 1000,
  });
  const updateMutation = useMutation({
    mutationFn: () => updateJournalEntry(entry.id, { occurredOn, caption, drillId: drillId || null }),
    onSuccess: async (updatedEntry) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["journal"] }),
        queryClient.invalidateQueries({ queryKey: ["drill-journal"] }),
        queryClient.invalidateQueries({ queryKey: ["drills"] }),
      ]);
      queryClient.setQueryData(["journal", entry.id], updatedEntry);
      router.replace(detailHref);
      router.refresh();
    },
  });

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const drills = drillsQuery.data?.drills ?? [];
  const errorMessage = useMemo(() => {
    if (!updateMutation.isError) return null;
    return updateMutation.error instanceof Error ? updateMutation.error.message : "Journal entry could not be updated.";
  }, [updateMutation.error, updateMutation.isError]);

  function navigate(destination: string) {
    if (!dirty) {
      router.push(destination);
      return;
    }
    setPendingDestination(destination);
    setDiscardOpen(true);
  }

  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <button type="button" className={styles.back} aria-label="Back to journal entry" onClick={() => navigate(detailHref)}>←</button>
        <p className="eyebrow">Edit Journal Entry</p>
      </header>
      <section className={styles.pageHeading}>
        <h1>Edit Entry</h1>
        <p>Update the training details without replacing the video.</p>
      </section>

      <form className={styles.uploadForm} onSubmit={(event) => {
        event.preventDefault();
        updateMutation.mutate();
      }}>
        <JournalVideoPlayer src={entry.playbackUrl} poster={entry.posterUrl} label="Journal entry video" />
        <div className={styles.field}>
          <span>Training date</span>
          <JournalDatePicker value={occurredOn} disabled={updateMutation.isPending} onChange={setOccurredOn} />
        </div>
        <label className={styles.field}>
          <span>Caption <small>(optional)</small></span>
          <textarea
            rows={4}
            maxLength={2000}
            value={caption}
            disabled={updateMutation.isPending}
            onChange={(event) => setCaption(event.target.value)}
          />
        </label>
        <div className={styles.field}>
          <span>Related drill <small>(optional)</small></span>
          <JournalDrillPicker
            drills={drills}
            value={drillId}
            disabled={updateMutation.isPending}
            loading={drillsQuery.isPending}
            onChange={setDrillId}
          />
        </div>
        {errorMessage && <p className={styles.formError} role="alert">{errorMessage}</p>}
        <div className={styles.formActions}>
          <button type="button" className={styles.secondaryAction} onClick={() => navigate(detailHref)}>Cancel</button>
          <button type="submit" className={styles.primaryAction} disabled={!dirty || updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>

      <RoutedBottomNav activeView="profile" onNavigate={(destination) => navigate(destination)} />
      <JournalDiscardSheet
        open={discardOpen}
        pending={false}
        title="Discard journal changes?"
        description="Your unsaved date, caption, and drill changes will be lost."
        discardLabel="Discard changes"
        onStay={() => {
          setDiscardOpen(false);
          setPendingDestination(null);
        }}
        onDiscard={() => {
          setDiscardOpen(false);
          router.push(pendingDestination ?? detailHref);
        }}
      />
    </main>
  );
}
