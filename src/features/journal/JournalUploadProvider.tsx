"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react/X";
import { useQueryClient } from "@tanstack/react-query";
import {
  completeJournalEntryUpload,
  createJournalUpload,
  deleteJournalEntry,
  uploadJournalEntryPoster,
  type JournalUploadIntentResponse,
} from "@/data";
import {
  createPosterFromImage,
  createVideoPoster,
  type GeneratedVideoPoster,
} from "./create-video-poster";
import { uploadJournalVideo, validateJournalVideoFile } from "./upload-journal-video";
import styles from "./JournalMedia.module.css";

type UploadPhase = "idle" | "creating" | "uploading" | "completing" | "error" | "ready";
type UploadRailPhase = Exclude<UploadPhase, "idle"> | "draft";
type FailedStage = "intent" | "upload" | "poster" | "complete" | null;
type PosterStatus = "empty" | "generating" | "ready" | "unavailable";

type JournalDraft = {
  file: File | null;
  previewUrl: string | null;
  occurredOn: string;
  caption: string;
  drillId: string;
  durationMs: number | null;
  posterPreviewUrl: string | null;
  posterTimeSeconds: number | null;
  posterStatus: PosterStatus;
};

type JournalUploadContextValue = {
  draft: JournalDraft;
  phase: UploadPhase;
  progress: number;
  error: string | null;
  completedEntryId: string | null;
  busy: boolean;
  hasWork: boolean;
  setFile: (file: File) => void;
  setOccurredOn: (value: string) => void;
  setCaption: (value: string) => void;
  setDrillId: (value: string) => void;
  setDurationMs: (value: number | null) => void;
  setPreparedPoster: (poster: GeneratedVideoPoster) => void;
  setPosterImage: (file: File) => Promise<void>;
  startUpload: () => Promise<void>;
  cancelUpload: () => Promise<void>;
  discardWork: () => Promise<void>;
  clearCompleted: () => void;
};

const JournalUploadContext = createContext<JournalUploadContextValue | null>(null);

export function JournalUploadProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<JournalDraft>(() => emptyDraft());
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [failedStage, setFailedStage] = useState<FailedStage>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<JournalUploadIntentResponse | null>(null);
  const [completedEntryId, setCompletedEntryId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const intentRef = useRef<JournalUploadIntentResponse | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const posterPreviewUrlRef = useRef<string | null>(null);
  const posterFileRef = useRef<File | null>(null);
  const posterPromiseRef = useRef<Promise<File | null> | null>(null);
  const posterGenerationRef = useRef(0);
  const busy = phase === "creating" || phase === "uploading" || phase === "completing";
  const hasDraftChanges = Boolean(
    draft.file || draft.caption.trim() || draft.drillId || draft.occurredOn !== localToday(),
  );
  const hasWork = hasDraftChanges || busy || phase === "error";

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasWork) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasWork]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (posterPreviewUrlRef.current) URL.revokeObjectURL(posterPreviewUrlRef.current);
  }, []);

  const commitPoster = useCallback((poster: GeneratedVideoPoster, generation: number) => {
    if (posterGenerationRef.current !== generation) return;
    if (posterPreviewUrlRef.current) URL.revokeObjectURL(posterPreviewUrlRef.current);
    const posterPreviewUrl = URL.createObjectURL(poster.file);
    posterPreviewUrlRef.current = posterPreviewUrl;
    posterFileRef.current = poster.file;
    posterPromiseRef.current = Promise.resolve(poster.file);
    setDraft((current) => ({
      ...current,
      posterPreviewUrl,
      posterTimeSeconds: poster.timeSeconds,
      posterStatus: "ready",
    }));
  }, []);

  const resetDraft = useCallback(() => {
    posterGenerationRef.current += 1;
    posterFileRef.current = null;
    posterPromiseRef.current = null;
    if (posterPreviewUrlRef.current) URL.revokeObjectURL(posterPreviewUrlRef.current);
    posterPreviewUrlRef.current = null;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setDraft(emptyDraft());
  }, []);

  const discardWork = useCallback(async () => {
    abortRef.current?.abort();
    const stagedEntryId = intentRef.current?.entryId;
    if (stagedEntryId) await deleteJournalEntry(stagedEntryId).catch(() => undefined);
    intentRef.current = null;
    setIntent(null);
    setPhase("idle");
    setFailedStage(null);
    setProgress(0);
    setError(null);
    setCompletedEntryId(null);
    resetDraft();
  }, [resetDraft]);

  const startUpload = useCallback(async () => {
    const file = draft.file;
    if (!file || busy) return;
    const poster = posterFileRef.current ?? await posterPromiseRef.current;
    if (!poster) {
      setError("Choose a cover before uploading this journal entry.");
      return;
    }
    setError(null);
    setCompletedEntryId(null);
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
          durationMs: draft.durationMs,
          occurredOn: draft.occurredOn,
          caption: draft.caption,
          drillId: draft.drillId || null,
        }, { requestInit: { signal: controller.signal } });
        intentRef.current = nextIntent;
        setIntent(nextIntent);
      }

      if (failedStage !== "complete" && failedStage !== "poster") {
        currentStage = "upload";
        setPhase("uploading");
        await uploadJournalVideo({
          file,
          intent: nextIntent,
          signal: controller.signal,
          onProgress: setProgress,
        });
      }

      if (failedStage !== "complete") {
        currentStage = "poster";
        await uploadJournalEntryPoster(nextIntent.entryId, poster, {
          requestInit: { signal: controller.signal },
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
      setFailedStage(null);
      setCompletedEntryId(entry.id);
      setPhase("ready");
      resetDraft();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["journal"] }),
        queryClient.invalidateQueries({ queryKey: ["drills"] }),
        queryClient.invalidateQueries({ queryKey: ["drill-journal"] }),
      ]);
      if (pathnameRef.current === "/journal/new") router.replace(`/journal/${entry.id}`);
    } catch (uploadError) {
      if (uploadError instanceof DOMException && uploadError.name === "AbortError") return;
      setFailedStage(currentStage);
      setPhase("error");
      setError(uploadError instanceof Error ? uploadError.message : "Journal entry could not be uploaded.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [busy, draft, failedStage, intent, queryClient, resetDraft, router]);

  const value = useMemo<JournalUploadContextValue>(() => ({
    draft,
    phase,
    progress,
    error,
    completedEntryId,
    busy,
    hasWork,
    setFile(file) {
      validateJournalVideoFile(file);
      const generation = posterGenerationRef.current + 1;
      posterGenerationRef.current = generation;
      posterFileRef.current = null;
      if (posterPreviewUrlRef.current) URL.revokeObjectURL(posterPreviewUrlRef.current);
      posterPreviewUrlRef.current = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;
      const posterPromise = createVideoPoster(file).then((poster) => {
        if (poster) {
          commitPoster(poster, generation);
          return poster.file;
        }
        if (posterGenerationRef.current === generation) {
          setDraft((current) => ({ ...current, posterStatus: "unavailable" }));
        }
        return null;
      });
      posterPromiseRef.current = posterPromise;
      setDraft((current) => ({
        ...current,
        file,
        previewUrl,
        durationMs: null,
        posterPreviewUrl: null,
        posterTimeSeconds: null,
        posterStatus: "generating",
      }));
      setError(null);
      setFailedStage(null);
      setProgress(0);
      setCompletedEntryId(null);
      if (phase === "ready") setPhase("idle");
    },
    setOccurredOn(value) {
      setDraft((current) => ({ ...current, occurredOn: value }));
    },
    setCaption(value) {
      setDraft((current) => ({ ...current, caption: value }));
    },
    setDrillId(value) {
      setDraft((current) => ({ ...current, drillId: value }));
    },
    setDurationMs(value) {
      setDraft((current) => ({ ...current, durationMs: value }));
    },
    setPreparedPoster(poster) {
      if (busy) return;
      const generation = posterGenerationRef.current + 1;
      posterGenerationRef.current = generation;
      commitPoster(poster, generation);
    },
    async setPosterImage(file) {
      if (busy) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Use a JPEG, PNG, or WebP cover image.");
      }
      if (file.size === 0 || file.size > 5 * 1024 * 1024) {
        throw new Error(file.size === 0 ? "Choose a non-empty cover image." : "Cover images must be 5 MB or smaller.");
      }
      const generation = posterGenerationRef.current + 1;
      posterGenerationRef.current = generation;
      const hadPoster = Boolean(posterFileRef.current);
      setDraft((current) => ({ ...current, posterStatus: "generating" }));
      const posterPromise = createPosterFromImage(file)
        .then((poster) => {
          commitPoster({ file: poster, timeSeconds: 0 }, generation);
          setDraft((current) => ({ ...current, posterTimeSeconds: null }));
          return poster;
        })
        .catch((error) => {
          if (posterGenerationRef.current === generation) {
            setDraft((current) => ({ ...current, posterStatus: hadPoster ? "ready" : "unavailable" }));
          }
          throw error;
        });
      posterPromiseRef.current = posterPromise;
      await posterPromise;
    },
    startUpload,
    async cancelUpload() {
      await discardWork();
    },
    discardWork,
    clearCompleted() {
      setCompletedEntryId(null);
      setPhase("idle");
      setError(null);
      setProgress(0);
    },
  }), [busy, commitPoster, completedEntryId, discardWork, draft, error, hasWork, phase, progress, startUpload]);

  return (
    <JournalUploadContext.Provider value={value}>
      {children}
      {pathname !== "/journal/new" && (phase !== "idle" || hasDraftChanges) && (
        <JournalUploadRail
          phase={phase === "idle" ? "draft" : phase}
          progress={progress}
          entryId={completedEntryId}
          onOpen={() => router.push(completedEntryId ? `/journal/${completedEntryId}` : "/journal/new")}
          onDismiss={() => value.clearCompleted()}
        />
      )}
    </JournalUploadContext.Provider>
  );
}

export function useJournalUpload(): JournalUploadContextValue {
  const value = useContext(JournalUploadContext);
  if (!value) throw new Error("useJournalUpload must be used inside JournalUploadProvider.");
  return value;
}

function JournalUploadRail({
  phase,
  progress,
  entryId,
  onOpen,
  onDismiss,
}: {
  phase: UploadRailPhase;
  progress: number;
  entryId: string | null;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const label = phase === "draft"
    ? "Journal draft waiting"
    : phase === "ready"
    ? "Journal entry ready"
    : phase === "error"
      ? "Upload needs attention"
      : phase === "completing"
        ? "Saving journal entry"
        : phase === "creating"
          ? "Preparing upload"
          : "Uploading journal entry";

  return (
    <aside className={styles.uploadRail} data-state={phase} aria-live="polite">
      <button type="button" onClick={onOpen}>
        <span>{label}</span>
        <strong>{phase === "draft" ? "Resume" : phase === "ready" ? "View" : phase === "error" ? "Review" : `${Math.round(progress)}%`}</strong>
      </button>
      {phase === "ready" && entryId && (
        <button className={styles.uploadRailDismiss} type="button" aria-label="Dismiss upload status" onClick={onDismiss}>
          <X size={16} weight="bold" aria-hidden="true" />
        </button>
      )}
      {phase !== "draft" && phase !== "ready" && phase !== "error" && <progress max="100" value={progress} />}
    </aside>
  );
}

function emptyDraft(): JournalDraft {
  return {
    file: null,
    previewUrl: null,
    occurredOn: localToday(),
    caption: "",
    drillId: "",
    durationMs: null,
    posterPreviewUrl: null,
    posterTimeSeconds: null,
    posterStatus: "empty",
  };
}

function localToday(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
