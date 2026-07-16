"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import {
  completeJournalEntryUpload,
  createJournalUpload,
  deleteJournalEntry,
  getDrills,
  type DrillFilterInput,
  type JournalUploadIntentResponse,
} from "@/data";
import { JournalDiscardSheet } from "./JournalDiscardSheet";
import { JournalFileError, uploadJournalVideo, validateJournalVideoFile } from "./upload-journal-video";
import styles from "./Journal.module.css";

const allDrillFilters: DrillFilterInput = {
  keywords: [],
  methodSlugs: [],
  tagSlugs: [],
  statusTagSlugs: [],
  tagMode: "all",
  statusMode: "all",
};

type UploadPhase = "idle" | "creating" | "uploading" | "completing" | "error";
type FailedStage = "intent" | "upload" | "complete" | null;
type PendingNavigation = { kind: "route"; destination: string } | { kind: "history" } | null;

export function JournalUploadScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = useMemo(localToday, []);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(today);
  const [caption, setCaption] = useState("");
  const [drillId, setDrillId] = useState("");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [failedStage, setFailedStage] = useState<FailedStage>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [intent, setIntent] = useState<JournalUploadIntentResponse | null>(null);
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const abortRef = useRef<AbortController | null>(null);
  const intentRef = useRef<JournalUploadIntentResponse | null>(null);
  const dirtyRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const atGuardEntryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);
  const drillsQuery = useQuery({
    queryKey: ["drills", allDrillFilters],
    queryFn: ({ signal }) => getDrills(allDrillFilters, { requestInit: { signal } }),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (dirty && !guardKeyRef.current) {
      const guardKey = `journal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      guardKeyRef.current = guardKey;
      atGuardEntryRef.current = true;
      window.history.pushState({ ...window.history.state, __journalGuard: guardKey }, "", window.location.href);
      return;
    }
    if (!dirty && guardKeyRef.current) {
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      if (atGuardEntryRef.current && window.history.state?.__journalGuard === guardKey) {
        ignoreNextPopRef.current = true;
        atGuardEntryRef.current = false;
        window.history.back();
      }
    }
  }, [dirty]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function handlePopState(event: PopStateEvent) {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        atGuardEntryRef.current = event.state?.__journalGuard === guardKeyRef.current;
        return;
      }
      const guardKey = guardKeyRef.current;
      if (!dirtyRef.current || !guardKey) return;
      if (event.state?.__journalGuard === guardKey) {
        atGuardEntryRef.current = true;
        return;
      }
      atGuardEntryRef.current = false;
      setPendingNavigation({ kind: "history" });
      setDiscardOpen(true);
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navigateWithoutPrompt = useCallback((destination: string) => {
    dirtyRef.current = false;
    setDirty(false);
    const guardKey = guardKeyRef.current;
    guardKeyRef.current = null;
    if (guardKey && atGuardEntryRef.current && window.history.state?.__journalGuard === guardKey) {
      ignoreNextPopRef.current = true;
      window.addEventListener("popstate", () => router.replace(destination), { once: true });
      window.history.back();
      return;
    }
    router.replace(destination);
  }, [router]);

  function requestNavigation(destination: string) {
    if (!dirtyRef.current) {
      navigateWithoutPrompt(destination);
      return;
    }
    setPendingNavigation({ kind: "route", destination });
    setDiscardOpen(true);
  }

  function stay() {
    if (pendingNavigation?.kind === "history" && !atGuardEntryRef.current) {
      ignoreNextPopRef.current = true;
      atGuardEntryRef.current = true;
      window.history.forward();
    }
    setDiscardOpen(false);
    setPendingNavigation(null);
  }

  async function discard() {
    setDiscarding(true);
    abortRef.current?.abort();
    const stagedEntryId = intentRef.current?.entryId;
    if (stagedEntryId) await deleteJournalEntry(stagedEntryId).catch(() => undefined);
    intentRef.current = null;
    setIntent(null);
    const navigation = pendingNavigation;
    setDiscardOpen(false);
    setPendingNavigation(null);
    setDiscarding(false);

    if (navigation?.kind === "history") {
      dirtyRef.current = false;
      guardKeyRef.current = null;
      ignoreNextPopRef.current = true;
      window.history.back();
      return;
    }
    navigateWithoutPrompt(navigation?.destination ?? "/?view=profile");
  }

  function selectFile(nextFile: File | null) {
    if (!nextFile) return;
    try {
      validateJournalVideoFile(nextFile);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(nextFile);
      setPreviewUrl(URL.createObjectURL(nextFile));
      setDurationMs(null);
      setError(null);
      setFailedStage(null);
      setProgress(0);
      setDirty(true);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Choose a valid video.");
    }
  }

  async function saveEntry() {
    if (!file || phase === "creating" || phase === "uploading" || phase === "completing") return;
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let currentStage: Exclude<FailedStage, null> = "intent";

    try {
      let nextIntent = intent;
      if (!nextIntent || failedStage === "intent") {
        setPhase("creating");
        nextIntent = await createJournalUpload({
          fileName: file.name,
          mimeType: file.type as "video/mp4" | "video/webm" | "video/quicktime",
          sizeBytes: file.size,
          durationMs,
          occurredOn,
          caption,
          drillId: drillId || null,
        }, { requestInit: { signal: controller.signal } });
        intentRef.current = nextIntent;
        setIntent(nextIntent);
      }

      if (failedStage !== "complete") {
        currentStage = "upload";
        setPhase("uploading");
        await uploadJournalVideo({
          file,
          intent: nextIntent,
          signal: controller.signal,
          onProgress: setProgress,
        });
      }

      setProgress(100);
      currentStage = "complete";
      setPhase("completing");
      const entry = await completeJournalEntryUpload(nextIntent.entryId, {
        requestInit: { signal: controller.signal },
      });
      intentRef.current = null;
      setIntent(null);
      dirtyRef.current = false;
      setDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["journal"] }),
        queryClient.invalidateQueries({ queryKey: ["drills"] }),
      ]);
      navigateWithoutPrompt(`/journal/${entry.id}`);
    } catch (saveError) {
      if (saveError instanceof DOMException && saveError.name === "AbortError") return;
      setFailedStage(currentStage);
      setPhase("error");
      setError(saveError instanceof Error ? saveError.message : "Journal entry could not be uploaded.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function cancelUpload() {
    abortRef.current?.abort();
    const stagedEntryId = intentRef.current?.entryId;
    if (stagedEntryId) await deleteJournalEntry(stagedEntryId).catch(() => undefined);
    intentRef.current = null;
    setIntent(null);
    setPhase("idle");
    setFailedStage(null);
    setProgress(0);
    setError(null);
  }

  const busy = phase === "creating" || phase === "uploading" || phase === "completing";
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

      <form className={styles.uploadForm} onSubmit={(event) => { event.preventDefault(); void saveEntry(); }}>
        <section className={styles.videoField}>
          {previewUrl ? (
            <video
              className={styles.videoPreview}
              controls
              playsInline
              preload="metadata"
              src={previewUrl}
              onLoadedMetadata={(event) => {
                const seconds = event.currentTarget.duration;
                if (Number.isFinite(seconds)) setDurationMs(Math.round(seconds * 1000));
              }}
            />
          ) : (
            <div className={styles.videoPlaceholder}>
              <VideoCamera size={36} weight="regular" aria-hidden="true" />
              <span>No video selected</span>
            </div>
          )}
          <div className={styles.fileActions}>
            <label className={styles.fileButton}>
              {file ? "Replace video" : "Choose or record video"}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mov"
                disabled={busy}
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {file && <span>{file.name} · {formatFileSize(file.size)}</span>}
          </div>
        </section>

        <label className={styles.field}>
          <span>Training date</span>
          <input type="date" value={occurredOn} disabled={busy} onChange={(event) => { setOccurredOn(event.target.value); setDirty(true); }} />
        </label>

        <label className={styles.field}>
          <span>Caption <small>Optional</small></span>
          <textarea
            rows={4}
            maxLength={2000}
            value={caption}
            disabled={busy}
            placeholder="What changed, clicked, or needs another look?"
            onChange={(event) => { setCaption(event.target.value); setDirty(true); }}
          />
        </label>

        <label className={styles.field}>
          <span>Related drill <small>Optional</small></span>
          <select value={drillId} disabled={busy || drillsQuery.isPending} onChange={(event) => { setDrillId(event.target.value); setDirty(true); }}>
            <option value="">No linked drill</option>
            {drills.map((drill) => <option key={drill.id} value={drill.id}>{drill.title}</option>)}
          </select>
        </label>

        {busy && (
          <div className={styles.progressBlock} aria-live="polite">
            <div className={styles.progressCopy}>
              <span>{phase === "creating" ? "Preparing upload" : phase === "completing" ? "Saving entry" : "Uploading video"}</span>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <progress max="100" value={progress} />
          </div>
        )}

        {error && <p className={styles.formError} role="alert">{error}</p>}

        <div className={styles.formActions}>
          {busy ? (
            <button type="button" className={styles.secondaryAction} onClick={() => void cancelUpload()}>Cancel upload</button>
          ) : (
            <button type="button" className={styles.secondaryAction} onClick={() => requestNavigation("/?view=profile")}>Cancel</button>
          )}
          <button type="submit" className={styles.primaryAction} disabled={!file || busy || !occurredOn}>
            {phase === "error" ? "Retry upload" : busy ? "Uploading..." : "Upload entry"}
          </button>
        </div>
      </form>

      <RoutedBottomNav activeView="profile" onNavigate={(destination) => requestNavigation(destination)} />
      <JournalDiscardSheet open={discardOpen} pending={discarding} onStay={stay} onDiscard={() => void discard()} />
    </main>
  );
}

function localToday(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
