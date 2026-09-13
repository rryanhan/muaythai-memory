"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { getDrills } from "@/data/drills";
import { updateJournalEntry } from "@/data/journal";
import type { DrillFilterInput, JournalEntryDetail } from "@/data/types";
import {
  isHistoryGuardState,
  restoreHistoryGuard,
  type HistoryGuardEntry,
} from "@/features/onboarding/history-guard";
import { JournalDatePicker } from "./JournalDatePicker";
import { JournalDiscardSheet } from "./JournalDiscardSheet";
import { JournalDrillPicker } from "./JournalDrillPicker";
import { JournalVideoPlayer } from "./JournalVideoPlayer";
import styles from "./Journal.module.css";

const allDrillFilters: DrillFilterInput = {
  keywords: [], methodSlugs: [], tagSlugs: [], statusTagSlugs: [], tagMode: "all", statusMode: "all",
};
const journalEditGuardMarker = "__journalEditGuard";

type PendingNavigation = { kind: "route"; destination: string } | { kind: "history" } | null;

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
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const dirtyRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const guardEntryRef = useRef<HistoryGuardEntry | null>(null);
  const baseEntryRef = useRef<HistoryGuardEntry | null>(null);
  const navigationReleasedRef = useRef(false);
  const detailHref = returnDrillId ? `/journal/${entry.id}?fromDrill=${returnDrillId}` : `/journal/${entry.id}`;
  const dirty = occurredOn !== entry.occurredOn || caption !== (entry.caption ?? "") || drillId !== (entry.drill?.id ?? "");
  const drillsQuery = useQuery({
    queryKey: ["drills", allDrillFilters],
    queryFn: ({ signal }) => getDrills(allDrillFilters, { requestInit: { signal } }),
    staleTime: 60 * 1000,
  });

  const armHistoryGuard = useCallback(() => {
    if (
      !dirtyRef.current
      || navigationReleasedRef.current
      || guardKeyRef.current
    ) return;

    const guardKey = `journal-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const baseEntry: HistoryGuardEntry = {
      key: guardKey,
      state: { ...(window.history.state ?? {}) },
      url: window.location.href,
    };
    const guardEntry: HistoryGuardEntry = {
      key: guardKey,
      state: { ...baseEntry.state, [journalEditGuardMarker]: guardKey },
      url: baseEntry.url,
    };
    guardKeyRef.current = guardKey;
    baseEntryRef.current = baseEntry;
    guardEntryRef.current = guardEntry;
    window.history.replaceState(guardEntry.state, "", guardEntry.url);
  }, []);

  const releaseHistoryGuard = useCallback((action: () => void) => {
    const guardKey = guardKeyRef.current;
    const baseEntry = baseEntryRef.current;

    if (
      guardKey
      && baseEntry
      && isHistoryGuardState(window.history.state, journalEditGuardMarker, guardKey)
    ) {
      window.history.replaceState(baseEntry.state, "", baseEntry.url);
    }

    guardKeyRef.current = null;
    guardEntryRef.current = null;
    baseEntryRef.current = null;
    action();
  }, []);

  const runWithoutPrompt = useCallback((action: () => void) => {
    dirtyRef.current = false;
    navigationReleasedRef.current = true;
    setDiscardOpen(false);
    setPendingNavigation(null);
    releaseHistoryGuard(action);
  }, [releaseHistoryGuard]);

  const navigateWithoutPrompt = useCallback((destination: string) => {
    runWithoutPrompt(() => router.push(destination));
  }, [router, runWithoutPrompt]);

  const updateMutation = useMutation({
    mutationFn: () => updateJournalEntry(entry.id, { occurredOn, caption, drillId: drillId || null }),
    onSuccess: async (updatedEntry) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["journal"] }),
        queryClient.invalidateQueries({ queryKey: ["drill-journal"] }),
      ]);
      queryClient.setQueryData(["journal", entry.id], updatedEntry);
      runWithoutPrompt(() => {
        router.replace(detailHref);
        router.refresh();
      });
    },
  });

  useEffect(() => {
    dirtyRef.current = dirty;
    const guarded = dirty && !navigationReleasedRef.current;

    if (guarded && !guardKeyRef.current) {
      armHistoryGuard();
      return;
    }

    if (!guarded && guardKeyRef.current) {
      releaseHistoryGuard(() => {});
    }
  }, [armHistoryGuard, dirty, releaseHistoryGuard]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handlePopState(event: PopStateEvent) {
      const guardKey = guardKeyRef.current;
      if (!dirtyRef.current || !guardKey) return;

      const guardEntry = guardEntryRef.current;
      if (!guardEntry) return;

      // Stop Next from applying the attempted same-document traversal, then
      // recreate the marked editor entry from that target. The push truncates
      // the old forward editor entry without traversing unknown history.
      event.stopImmediatePropagation();
      restoreHistoryGuard(guardEntry);
      setPendingNavigation({ kind: "history" });
      setDiscardOpen(true);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState, { capture: true });
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState, { capture: true });
    };
  }, []);

  const drills = drillsQuery.data?.drills ?? [];
  const errorMessage = useMemo(() => {
    if (!updateMutation.isError) return null;
    return updateMutation.error instanceof Error ? updateMutation.error.message : "Journal entry could not be updated.";
  }, [updateMutation.error, updateMutation.isError]);

  function navigate(destination: string) {
    if (updateMutation.isPending) return;
    if (!dirtyRef.current) {
      navigateWithoutPrompt(destination);
      return;
    }
    setPendingNavigation({ kind: "route", destination });
    setDiscardOpen(true);
  }

  function stay() {
    setDiscardOpen(false);
    setPendingNavigation(null);
  }

  function discard() {
    if (updateMutation.isPending) return;
    const navigation = pendingNavigation;
    setDiscardOpen(false);
    setPendingNavigation(null);

    if (navigation?.kind === "history") {
      dirtyRef.current = false;
      navigationReleasedRef.current = true;
      releaseHistoryGuard(() => window.history.back());
      return;
    }

    navigateWithoutPrompt(navigation?.destination ?? detailHref);
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
        pending={updateMutation.isPending}
        title="Discard journal changes?"
        description="Your unsaved date, caption, and drill changes will be lost."
        discardLabel="Discard changes"
        onStay={stay}
        onDiscard={discard}
      />
    </main>
  );
}
