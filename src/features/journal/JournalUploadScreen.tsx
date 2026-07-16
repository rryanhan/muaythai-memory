"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { useQuery } from "@tanstack/react-query";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { getDrills, type DrillFilterInput } from "@/data";
import { JournalDatePicker } from "./JournalDatePicker";
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

type PendingNavigation = { kind: "route"; destination: string } | { kind: "history" } | null;

export function JournalUploadScreen() {
  const router = useRouter();
  const today = useMemo(localToday, []);
  const upload = useJournalUpload();
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const guardKeyRef = useRef<string | null>(null);
  const atGuardEntryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);
  const shouldGuard = upload.phase === "idle" && Boolean(
    upload.draft.file ||
    upload.draft.caption.trim() ||
    upload.draft.drillId ||
    upload.draft.occurredOn !== today,
  );
  const guardRef = useRef(shouldGuard);
  const locked = upload.busy || upload.phase === "error";
  const drillsQuery = useQuery({
    queryKey: ["drills", allDrillFilters],
    queryFn: ({ signal }) => getDrills(allDrillFilters, { requestInit: { signal } }),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    guardRef.current = shouldGuard;
    if (shouldGuard && !guardKeyRef.current) {
      const guardKey = `journal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      guardKeyRef.current = guardKey;
      atGuardEntryRef.current = true;
      window.history.pushState({ ...window.history.state, __journalGuard: guardKey }, "", window.location.href);
      return;
    }
    if (!shouldGuard && guardKeyRef.current) {
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      if (atGuardEntryRef.current && window.history.state?.__journalGuard === guardKey) {
        ignoreNextPopRef.current = true;
        atGuardEntryRef.current = false;
        window.history.back();
      }
    }
  }, [shouldGuard]);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        atGuardEntryRef.current = event.state?.__journalGuard === guardKeyRef.current;
        return;
      }
      const guardKey = guardKeyRef.current;
      if (!guardRef.current || !guardKey) return;
      if (event.state?.__journalGuard === guardKey) {
        atGuardEntryRef.current = true;
        return;
      }
      atGuardEntryRef.current = false;
      setPendingNavigation({ kind: "history" });
      setDiscardOpen(true);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateWithoutPrompt = useCallback((destination: string) => {
    guardRef.current = false;
    const guardKey = guardKeyRef.current;
    guardKeyRef.current = null;
    if (guardKey && atGuardEntryRef.current && window.history.state?.__journalGuard === guardKey) {
      ignoreNextPopRef.current = true;
      window.addEventListener("popstate", () => router.push(destination), { once: true });
      window.history.back();
      return;
    }
    router.push(destination);
  }, [router]);

  function requestNavigation(destination: string) {
    if (upload.phase !== "idle" || !guardRef.current) {
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
    await upload.discardWork();
    const navigation = pendingNavigation;
    setDiscardOpen(false);
    setPendingNavigation(null);
    setDiscarding(false);

    if (navigation?.kind === "history") {
      guardRef.current = false;
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
      upload.setFile(nextFile);
      setSelectionError(null);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Choose a valid video.");
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

        <div className={styles.field}>
          <span>Training date</span>
          <JournalDatePicker
            value={upload.draft.occurredOn}
            disabled={locked}
            onChange={upload.setOccurredOn}
          />
        </div>

        <label className={styles.field}>
          <span>Caption <small>Optional</small></span>
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
          <span>Related drill <small>Optional</small></span>
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
          <button type="submit" className={styles.primaryAction} disabled={!upload.draft.file || upload.busy || !upload.draft.occurredOn}>
            {upload.phase === "error" ? "Retry upload" : upload.busy ? "Uploading..." : "Upload entry"}
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
