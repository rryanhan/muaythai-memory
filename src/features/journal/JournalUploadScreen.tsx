"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { useQuery } from "@tanstack/react-query";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { getDrills } from "@/data/drills";
import type { DrillFilterInput } from "@/data/types";
import {
  isHistoryGuardState,
  restoreHistoryGuard,
  type HistoryGuardEntry,
} from "@/features/onboarding/history-guard";
import { JournalDatePicker } from "./JournalDatePicker";
import { JournalCoverEditor } from "./JournalCoverEditor";
import { JournalDiscardSheet } from "./JournalDiscardSheet";
import { JournalDrillPicker } from "./JournalDrillPicker";
import { useJournalUpload } from "./JournalUploadProvider";
import { JournalVideoPlayer } from "./JournalVideoPlayer";
import styles from "./Journal.module.css";

const allDrillFilters: DrillFilterInput = {
  keywords: [],
  methodSlugs: [],
  tagSlugs: [],
  statusTagSlugs: [],
  tagMode: "all",
  statusMode: "all",
};

type PendingNavigation =
  | { kind: "route"; destination: string }
  | { kind: "history"; delta: number | null; entryKey: string | null }
  | null;
const journalUploadGuardMarker = "__journalGuard";

export function JournalUploadScreen() {
  const router = useRouter();
  const upload = useJournalUpload();
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [restoringHistory, setRestoringHistory] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const pendingNavigationRef = useRef<PendingNavigation>(null);
  const guardKeyRef = useRef<string | null>(null);
  const guardEntryRef = useRef<HistoryGuardEntry | null>(null);
  const baseEntryRef = useRef<HistoryGuardEntry | null>(null);
  const guardIndexRef = useRef<number | null>(null);
  const guardNavigationKeyRef = useRef<string | null>(null);
  const restoringToIndexRef = useRef<number | null>(null);
  const fallbackRestoringRef = useRef(false);
  const releasedTraversalKeyRef = useRef<string | null>(null);
  const deferredDiscardCompletionRef = useRef<(() => void) | null>(null);
  const navigationReleasedRef = useRef(false);
  const mountedRef = useRef(false);
  const discardPendingRef = useRef(false);
  const discardFailedRef = useRef(false);
  const discardOperationRef = useRef(0);
  const shouldGuard = upload.phase === "idle" && upload.hasWork;
  const guardRef = useRef(shouldGuard);
  const locked = upload.busy || upload.phase === "error";
  const drillsQuery = useQuery({
    queryKey: ["drills", allDrillFilters],
    queryFn: ({ signal }) => getDrills(allDrillFilters, { requestInit: { signal } }),
    staleTime: 60 * 1000,
  });

  const releaseHistoryGuard = useCallback((action: () => void) => {
    const guardKey = guardKeyRef.current;
    const baseEntry = baseEntryRef.current;
    if (
      guardKey
      && baseEntry
      && isHistoryGuardState(window.history.state, journalUploadGuardMarker, guardKey)
    ) {
      window.history.replaceState(baseEntry.state, "", baseEntry.url);
    }
    guardKeyRef.current = null;
    guardEntryRef.current = null;
    baseEntryRef.current = null;
    guardIndexRef.current = null;
    guardNavigationKeyRef.current = null;
    restoringToIndexRef.current = null;
    action();
  }, []);

  const traverseHistory = useCallback((delta: number) => {
    window.history.go(delta);
  }, []);

  useEffect(() => {
    if (!upload.hasWork) discardFailedRef.current = false;
    const guarded = (shouldGuard || discardPendingRef.current || discardFailedRef.current)
      && !navigationReleasedRef.current;
    guardRef.current = guarded;
    if (guarded && !guardKeyRef.current) {
      const guardKey = `journal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const baseEntry: HistoryGuardEntry = {
        key: guardKey,
        state: { ...(window.history.state ?? {}) },
        url: window.location.href,
      };
      const guardEntry: HistoryGuardEntry = {
        key: guardKey,
        state: { ...baseEntry.state, [journalUploadGuardMarker]: guardKey },
        url: baseEntry.url,
      };
      guardKeyRef.current = guardKey;
      baseEntryRef.current = baseEntry;
      guardEntryRef.current = guardEntry;
      window.history.replaceState(guardEntry.state, "", guardEntry.url);
      guardIndexRef.current = currentHistoryIndex();
      guardNavigationKeyRef.current = currentHistoryEntryKey();
      return;
    }
    if (!guarded && guardKeyRef.current) {
      releaseHistoryGuard(() => {});
    }
  }, [releaseHistoryGuard, shouldGuard, upload.hasWork]);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      if (
        releasedTraversalKeyRef.current
        && currentHistoryEntryKey() === releasedTraversalKeyRef.current
      ) {
        releasedTraversalKeyRef.current = null;
        discardPendingRef.current = false;
      }
      const guardKey = guardKeyRef.current;
      const guardEntry = guardEntryRef.current;
      if (!guardRef.current || !guardKey || !guardEntry) return;

      const currentIndex = currentHistoryIndex();
      const restoringToIndex = restoringToIndexRef.current;
      if (
        restoringToIndex !== null
        && currentIndex === restoringToIndex
        && isHistoryGuardState(event.state, journalUploadGuardMarker, guardKey)
      ) {
        event.stopImmediatePropagation();
        restoringToIndexRef.current = null;
        setRestoringHistory(false);
        const completeDiscard = deferredDiscardCompletionRef.current;
        deferredDiscardCompletionRef.current = null;
        completeDiscard?.();
        return;
      }

      event.stopImmediatePropagation();
      setDiscardOpen(true);
      const guardIndex = guardIndexRef.current;
      if (guardIndex !== null && currentIndex !== null && guardIndex !== currentIndex) {
        if (!pendingNavigationRef.current) {
          const navigation: PendingNavigation = {
            kind: "history",
            delta: currentIndex - guardIndex,
            entryKey: currentHistoryEntryKey(),
          };
          pendingNavigationRef.current = navigation;
          setPendingNavigation(navigation);
        }
        restoringToIndexRef.current = guardIndex;
        setRestoringHistory(true);
        const navigationApi = window.navigation;
        const guardNavigationKey = guardNavigationKeyRef.current;
        if (navigationApi && guardNavigationKey) {
          const finishFailedRestoration = () => {
            if (!mountedRef.current || restoringToIndexRef.current !== guardIndex) return;
            fallbackRestoringRef.current = true;
            try {
              restoreHistoryGuard(guardEntry);
              guardIndexRef.current = currentHistoryIndex();
              guardNavigationKeyRef.current = currentHistoryEntryKey();
              const pendingNavigation = pendingNavigationRef.current;
              if (pendingNavigation?.kind === "history") {
                const fallbackNavigation: PendingNavigation = {
                  ...pendingNavigation,
                  // pushState placed the attempted target immediately behind
                  // the replacement guard, regardless of the original jump.
                  delta: -1,
                };
                pendingNavigationRef.current = fallbackNavigation;
                setPendingNavigation(fallbackNavigation);
              }
            } catch {
              // The attempted history entry remains current; a confirmed
              // discard can still release to its absolute Navigation API key.
              guardIndexRef.current = currentHistoryIndex();
              guardNavigationKeyRef.current = currentHistoryEntryKey();
            } finally {
              restoringToIndexRef.current = null;
              setRestoringHistory(false);
              fallbackRestoringRef.current = false;
              const completeDiscard = deferredDiscardCompletionRef.current;
              deferredDiscardCompletionRef.current = null;
              completeDiscard?.();
            }
          };
          try {
            observeNavigationFailure(
              navigationApi.traverseTo(guardNavigationKey),
              finishFailedRestoration,
            );
          } catch {
            finishFailedRestoration();
          }
        } else {
          traverseHistory(guardIndex - currentIndex);
        }
      } else {
        // Older engines without a usable Navigation API index cannot traverse
        // back to the unchanged guard deterministically. Pushing a copy still
        // protects the draft and leaves the attempted entry directly behind it,
        // but necessarily sacrifices any later forward entries.
        if (!pendingNavigationRef.current) {
          const navigation: PendingNavigation = {
            kind: "history",
            delta: null,
            entryKey: null,
          };
          pendingNavigationRef.current = navigation;
          setPendingNavigation(navigation);
        }
        fallbackRestoringRef.current = true;
        try {
          restoreHistoryGuard(guardEntry);
        } finally {
          fallbackRestoringRef.current = false;
          const completeDiscard = deferredDiscardCompletionRef.current;
          deferredDiscardCompletionRef.current = null;
          completeDiscard?.();
        }
      }
    }

    function handleNavigate(event: NavigateEvent) {
      if (event.navigationType !== "traverse" || !event.destination.sameDocument) return;

      const releasedTraversalKey = releasedTraversalKeyRef.current;
      if (releasedTraversalKey && event.destination.key === releasedTraversalKey) return;

      const restoringToIndex = restoringToIndexRef.current;
      if (
        restoringToIndex !== null
        && event.destination.index === restoringToIndex
      ) {
        return;
      }

      if (discardPendingRef.current) {
        event.preventDefault();
        return;
      }
      if (!guardRef.current) return;
      event.preventDefault();
      if (pendingNavigationRef.current) return;

      const guardIndex = guardIndexRef.current;
      const destinationIndex = event.destination.index;
      const navigation: PendingNavigation = {
        kind: "history",
        delta: guardIndex !== null && Number.isSafeInteger(destinationIndex)
          ? destinationIndex - guardIndex
          : null,
        entryKey: event.destination.key || null,
      };
      pendingNavigationRef.current = navigation;
      setPendingNavigation(navigation);
      setDiscardOpen(true);
    }

    mountedRef.current = true;
    const navigationApi = window.navigation;
    // The cancelable precommit event closes the discard-vs-traversal race.
    // Engines without Navigation API support fall back to restoring as soon as
    // their committed popstate arrives; they cannot pre-cancel an in-flight step.
    window.addEventListener("popstate", handlePopState, { capture: true });
    navigationApi?.addEventListener("navigate", handleNavigate);
    return () => {
      mountedRef.current = false;
      discardOperationRef.current += 1;
      window.removeEventListener("popstate", handlePopState, { capture: true });
      navigationApi?.removeEventListener("navigate", handleNavigate);
      const guardKey = guardKeyRef.current;
      const baseEntry = baseEntryRef.current;
      if (
        guardKey
        && baseEntry
        && isHistoryGuardState(window.history.state, journalUploadGuardMarker, guardKey)
      ) {
        window.history.replaceState(baseEntry.state, "", baseEntry.url);
      }
      guardKeyRef.current = null;
      guardEntryRef.current = null;
      baseEntryRef.current = null;
      guardIndexRef.current = null;
      guardNavigationKeyRef.current = null;
      restoringToIndexRef.current = null;
      fallbackRestoringRef.current = false;
      releasedTraversalKeyRef.current = null;
      deferredDiscardCompletionRef.current = null;
      pendingNavigationRef.current = null;
      discardPendingRef.current = false;
      discardFailedRef.current = false;
    };
  }, [traverseHistory]);

  const navigateWithoutPrompt = useCallback((destination: string) => {
    if (discardPendingRef.current || restoringToIndexRef.current !== null) return;
    guardRef.current = false;
    navigationReleasedRef.current = true;
    setDiscardOpen(false);
    setPendingNavigation(null);
    pendingNavigationRef.current = null;
    setRestoringHistory(false);
    releaseHistoryGuard(() => router.push(destination));
  }, [releaseHistoryGuard, router]);

  function requestNavigation(destination: string) {
    if (discardPendingRef.current || restoringToIndexRef.current !== null) return;
    if (
      !guardRef.current
      || (upload.phase !== "idle" && !discardFailedRef.current)
    ) {
      navigateWithoutPrompt(destination);
      return;
    }
    if (!pendingNavigationRef.current) {
      const navigation: PendingNavigation = { kind: "route", destination };
      pendingNavigationRef.current = navigation;
      setPendingNavigation(navigation);
    }
    setDiscardError(null);
    setDiscardOpen(true);
  }

  function stay() {
    if (discardPendingRef.current || restoringToIndexRef.current !== null) return;
    setDiscardOpen(false);
    setDiscardError(null);
    setPendingNavigation(null);
    pendingNavigationRef.current = null;
  }

  async function discard() {
    if (discardPendingRef.current || restoringToIndexRef.current !== null) return;
    discardPendingRef.current = true;
    setDiscardError(null);
    const operation = discardOperationRef.current + 1;
    discardOperationRef.current = operation;
    setDiscarding(true);
    try {
      await upload.discardWork();
    } catch (error) {
      if (mountedRef.current && discardOperationRef.current === operation) {
        discardPendingRef.current = false;
        discardFailedRef.current = true;
        setDiscardError(error instanceof Error
          ? error.message
          : "Journal upload could not be discarded. Try again.");
        setDiscarding(false);
      }
      return;
    }
    if (!mountedRef.current || discardOperationRef.current !== operation) return;

    const completeDiscard = () => {
      if (!mountedRef.current || discardOperationRef.current !== operation) return;
      const navigation = pendingNavigationRef.current ?? pendingNavigation;
      discardFailedRef.current = false;
      setDiscardOpen(false);
      setDiscardError(null);
      setPendingNavigation(null);
      pendingNavigationRef.current = null;
      setDiscarding(false);

      if (navigation?.kind === "history") {
        guardRef.current = false;
        navigationReleasedRef.current = true;
        releaseHistoryGuard(() => {
          const navigationApi = window.navigation;
          if (navigation.entryKey && navigationApi) {
            releasedTraversalKeyRef.current = navigation.entryKey;
            const fallback = () => {
              if (!mountedRef.current || discardOperationRef.current !== operation) return;
              releasedTraversalKeyRef.current = null;
              discardPendingRef.current = false;
              if (navigation.delta !== null) traverseHistory(navigation.delta);
              else window.history.back();
            };
            try {
              observeNavigationCommit(
                navigationApi.traverseTo(navigation.entryKey),
                () => {
                  if (!mountedRef.current || discardOperationRef.current !== operation) return;
                  releasedTraversalKeyRef.current = null;
                  discardPendingRef.current = false;
                },
                fallback,
              );
            } catch {
              fallback();
            }
            return;
          }
          discardPendingRef.current = false;
          if (navigation.delta !== null) {
            traverseHistory(navigation.delta);
            return;
          }
          window.history.back();
        });
        return;
      }
      discardPendingRef.current = false;
      navigateWithoutPrompt(navigation?.destination ?? "/?view=profile");
    };

    if (restoringToIndexRef.current !== null || fallbackRestoringRef.current) {
      deferredDiscardCompletionRef.current = completeDiscard;
      return;
    }
    completeDiscard();
  }

  function selectFile(nextFile: File | null) {
    if (!nextFile) return;
    try {
      upload.setFile(nextFile);
      setCoverEditorOpen(false);
      setSelectionError(null);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Choose a valid video.");
    }
  }

  async function selectCoverImage(nextFile: File | null) {
    if (!nextFile) return;
    try {
      await upload.setPosterImage(nextFile);
      setSelectionError(null);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Choose a valid cover image.");
    }
  }

  const drills = drillsQuery.data?.drills ?? [];

  return (
    <main className={styles.page}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={styles.routeHeader}>
        <button type="button" className={styles.back} aria-label="Back to Profile" onClick={() => requestNavigation("/?view=profile")}>←</button>
        <p className="eyebrow">Progress Journal</p>
      </header>

      <section className={styles.pageHeading}>
        <h1>New Entry</h1>
        <p>Keep a short visual record of your training.</p>
      </section>

      <form className={styles.uploadForm} onSubmit={(event) => {
        event.preventDefault();
        void upload.startUpload();
      }}>
        <section className={styles.videoField}>
          {upload.draft.previewUrl ? (
            <JournalVideoPlayer
              src={upload.draft.previewUrl}
              poster={upload.draft.posterPreviewUrl}
              label="Selected journal video"
              onDuration={upload.setDurationMs}
              flush
            />
          ) : (
            <div className={styles.videoPlaceholder}>
              <VideoCamera size={36} weight="regular" aria-hidden="true" />
              <span>No video selected</span>
            </div>
          )}
          <div className={styles.fileActions}>
            <label className={styles.fileButton}>
              {upload.draft.file ? "Replace video" : "Choose or record video"}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mov"
                disabled={locked}
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {upload.draft.file && <span>{upload.draft.file.name} · {formatFileSize(upload.draft.file.size)}</span>}
          </div>
        </section>

        {upload.draft.file && (
          <section className={styles.coverField} aria-labelledby="journal-cover-title">
            <div className={styles.coverFieldHeading}>
              <div>
                <span id="journal-cover-title">Cover</span>
                <small>Shown in Progress Journal</small>
              </div>
              {upload.draft.posterStatus === "ready" && <strong>Ready</strong>}
            </div>
            <div className={styles.coverFieldBody}>
              <div className={styles.coverPreview} data-state={upload.draft.posterStatus}>
                {upload.draft.posterPreviewUrl ? (
                  // The generated local blob URL cannot pass through Next's image optimizer.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={upload.draft.posterPreviewUrl} alt="Selected journal cover" />
                ) : upload.draft.posterStatus === "generating" ? (
                  <span>Finding a clear frame...</span>
                ) : (
                  <span>Choose a cover image</span>
                )}
              </div>
              <div className={styles.coverCommands}>
                {upload.draft.posterStatus === "ready" && (
                  <button type="button" disabled={locked} onClick={() => setCoverEditorOpen(true)}>
                    Adjust frame
                  </button>
                )}
                <label>
                  {upload.draft.posterStatus === "ready" ? "Use an image" : "Choose cover image"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={locked}
                    onChange={(event) => {
                      void selectCoverImage(event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {upload.draft.posterStatus === "unavailable" && (
                  <p>This browser could not read a video frame. Add a still image to continue.</p>
                )}
              </div>
            </div>
          </section>
        )}

        <div className={styles.field}>
          <span>Training date</span>
          <JournalDatePicker
            value={upload.draft.occurredOn}
            disabled={locked}
            onChange={upload.setOccurredOn}
          />
        </div>

        <label className={styles.field}>
          <span>Caption <small>(optional)</small></span>
          <textarea
            rows={4}
            maxLength={2000}
            value={upload.draft.caption}
            disabled={locked}
            placeholder="What changed, clicked, or needs another look?"
            onChange={(event) => upload.setCaption(event.target.value)}
          />
        </label>

        <div className={styles.field}>
          <span>Related drill <small>(optional)</small></span>
          <JournalDrillPicker
            drills={drills}
            value={upload.draft.drillId}
            disabled={locked}
            loading={drillsQuery.isPending}
            onChange={upload.setDrillId}
            onCreateDrill={() => navigateWithoutPrompt("/drills/new?from=journal")}
          />
        </div>

        {upload.busy && (
          <div className={styles.progressBlock} aria-live="polite">
            <div className={styles.progressCopy}>
              <span>{upload.phase === "creating" ? "Preparing upload" : upload.phase === "completing" ? "Saving entry" : "Uploading video"}</span>
              <strong>{Math.round(upload.progress)}%</strong>
            </div>
            <progress max="100" value={upload.progress} />
          </div>
        )}

        {(selectionError || upload.error) && <p className={styles.formError} role="alert">{selectionError ?? upload.error}</p>}

        <div className={styles.formActions}>
          {upload.busy || upload.phase === "error" ? (
            <button type="button" className={styles.secondaryAction} onClick={() => void upload.cancelUpload()}>Cancel upload</button>
          ) : (
            <button type="button" className={styles.secondaryAction} onClick={() => requestNavigation("/?view=profile")}>Cancel</button>
          )}
          <button
            type="submit"
            className={styles.primaryAction}
            disabled={
              !upload.draft.file ||
              upload.draft.posterStatus !== "ready" ||
              upload.busy ||
              !upload.draft.occurredOn
            }
          >
            {upload.phase === "error" ? "Retry upload" : upload.busy ? "Uploading..." : "Upload entry"}
          </button>
        </div>
      </form>

      <RoutedBottomNav activeView="profile" onNavigate={(destination) => requestNavigation(destination)} />
      <JournalDiscardSheet
        open={discardOpen}
        pending={discarding || restoringHistory}
        error={discardError}
        onStay={stay}
        onDiscard={() => void discard()}
      />
      {coverEditorOpen && upload.draft.file && upload.draft.previewUrl && (
        <JournalCoverEditor
          file={upload.draft.file}
          sourceUrl={upload.draft.previewUrl}
          initialTimeSeconds={upload.draft.posterTimeSeconds}
          onCancel={() => setCoverEditorOpen(false)}
          onUseCover={(poster) => {
            upload.setPreparedPoster(poster);
            setCoverEditorOpen(false);
          }}
        />
      )}
    </main>
  );
}

function currentHistoryIndex(): number | null {
  const index = window.navigation?.currentEntry?.index;
  return typeof index === "number" && Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function currentHistoryEntryKey(): string | null {
  const key = window.navigation?.currentEntry?.key;
  return typeof key === "string" && key.length > 0 ? key : null;
}

function observeNavigationFailure(
  result: NavigationResult,
  onFailure: () => void,
): void {
  const committed = result.committed;
  if (committed) void committed.catch(onFailure);
  const finished = result.finished;
  if (finished && finished !== committed) void finished.catch(onFailure);
}

function observeNavigationCommit(
  result: NavigationResult,
  onCommit: () => void,
  onFailure: () => void,
): void {
  const commitSignal = result.committed ?? result.finished;
  if (commitSignal) void commitSignal.then(onCommit, onFailure);
  if (result.finished && result.finished !== commitSignal) {
    void result.finished.catch(() => undefined);
  }
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
