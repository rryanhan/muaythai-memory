"use client";

import dynamic from "next/dynamic";
import { Microphone } from "@phosphor-icons/react/Microphone";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ApiError } from "@/data/api-core";
import { createCaptureDraft } from "@/data/capture";
import { getTaxonomy } from "@/data/taxonomy";
import type { CaptureDraft } from "@/data/types";
import { AddDrillSkeleton } from "@/features/drills/AddDrillSkeleton";
import type { DrillFormCleanupState, DrillFormInitialValues } from "@/features/drills/drill-form-types";
import type { DrillCleanupValues } from "@/features/drills/cleanup-merge";
import drillStyles from "@/features/drills/DrillForm.module.css";
import type { CaptureTaxonomyResult } from "@/modules/capture/parser";
import { isCurrentCaptureCleanup } from "./capture-session";
import styles from "./Capture.module.css";
import type { VoiceCaptureState } from "./VoiceCapturePanel";

const AddDrillForm = dynamic(
  () => import("@/features/drills/AddDrillForm").then((module) => module.AddDrillForm),
  { loading: () => <AddDrillSkeleton /> },
);

const VoiceCapturePanel = dynamic(
  () => import("./VoiceCapturePanel").then((module) => module.VoiceCapturePanel),
  { loading: () => <VoiceCaptureLoading />, ssr: false },
);

export type CaptureMode = "voice" | "text";
export type CaptureWorkflowPhase = "input" | "processing" | "review";

export type CaptureWorkflowState = {
  mode: CaptureMode;
  phase: CaptureWorkflowPhase;
  hasUnsavedWork: boolean;
};

type CaptureDraftFormProps = {
  initialMode: CaptureMode;
  onWorkflowChange?: (state: CaptureWorkflowState) => void;
  onRequestExit?: () => void;
  onSaveSuccess?: (drillId: string) => void;
};

type CaptureSession = {
  id: number;
  transcript: string;
  source: CaptureMode;
  initialValues: DrillFormInitialValues;
  warnings: string[];
};

type CleanupSuggestion = {
  revision: number;
  values: DrillCleanupValues;
};

type CleanupRequest = {
  note: string;
  signal: AbortSignal;
  requestId: number;
  sessionId: number;
};

const idleVoiceState: VoiceCaptureState = {
  status: "idle",
  hasUnsavedWork: false,
};

export function CaptureDraftForm({
  initialMode,
  onWorkflowChange,
  onRequestExit,
  onSaveSuccess,
}: CaptureDraftFormProps) {
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [voiceState, setVoiceState] = useState<VoiceCaptureState>(idleVoiceState);
  const [transcript, setTranscript] = useState("");
  const [pendingVoiceTranscript, setPendingVoiceTranscript] = useState<string | null>(null);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [transcriptEditorOpen, setTranscriptEditorOpen] = useState(false);
  const [transcriptRevision, setTranscriptRevision] = useState("");
  const [cleanupSuggestion, setCleanupSuggestion] = useState<CleanupSuggestion | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [textFieldsRevealed, setTextFieldsRevealed] = useState(false);
  const abortController = useRef<AbortController | null>(null);
  const nextSessionId = useRef(1);
  const activeSessionId = useRef<number | null>(null);
  const nextCleanupRequestId = useRef(1);
  const activeCleanupRequestId = useRef<number | null>(null);
  const nextCleanupRevision = useRef(1);
  const nextParserRequestId = useRef(1);
  const activeParserRequestId = useRef<number | null>(null);
  const taxonomyQuery = useQuery({
    queryKey: ["taxonomy"],
    queryFn: ({ signal }) => getTaxonomy({ requestInit: { signal } }),
    staleTime: 10 * 60 * 1000,
  });
  const cleanupMutation = useMutation({
    mutationFn: ({ note, signal }: CleanupRequest) =>
      createCaptureDraft({ transcript: note }, { requestInit: { signal } }),
    onSuccess: (response, request) => {
      if (!isCurrentCaptureCleanup(request, activeCleanupRequestId.current, activeSessionId.current)) {
        return;
      }

      setCleanupPending(false);
      setCleanupSuggestion({
        revision: nextCleanupRevision.current++,
        values: toCleanupValues(response.draft),
      });
      setTextFieldsRevealed(true);
      setCleanupError(null);
      setSession((current) =>
        current?.id === request.sessionId
          ? {
              ...current,
              warnings: unique([...current.warnings, ...response.warnings]),
            }
          : current,
      );
    },
    onError: (error, request) => {
      if (
        isAbortError(error) ||
        !isCurrentCaptureCleanup(request, activeCleanupRequestId.current, activeSessionId.current)
      ) {
        return;
      }

      setCleanupPending(false);
      setTextFieldsRevealed(true);
      setCleanupError(getCaptureErrorMessage(error));
    },
  });

  useEffect(() => {
    return () => {
      activeParserRequestId.current = null;
      activeCleanupRequestId.current = null;
      abortController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!pendingVoiceTranscript || !taxonomyQuery.data) return;
    const readyTranscript = pendingVoiceTranscript;
    setPendingVoiceTranscript(null);
    void beginDraft(readyTranscript, "voice");
    // The transcript is consumed once when app-wide taxonomy becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVoiceTranscript, taxonomyQuery.data]);

  useEffect(() => {
    const phase: CaptureWorkflowPhase = session
      ? "review"
      : pendingVoiceTranscript ||
          voiceState.status === "finalizing" ||
          voiceState.status === "transcribing"
        ? "processing"
        : "input";
    const hasUnsavedWork = Boolean(
      session || pendingVoiceTranscript || transcript.trim() || voiceState.hasUnsavedWork,
    );

    onWorkflowChange?.({ mode, phase, hasUnsavedWork });
  }, [mode, onWorkflowChange, pendingVoiceTranscript, session, transcript, voiceState]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void beginDraft(transcript, "text");
  }

  async function beginDraft(note: string, source: CaptureMode) {
    const normalizedNote = note.trim();
    if (!taxonomyQuery.data || normalizedNote.length < 12) return;

    const parserRequestId = nextParserRequestId.current++;
    activeParserRequestId.current = parserRequestId;
    const { parseCaptureTranscript } = await import("@/modules/capture/parser");
    if (activeParserRequestId.current !== parserRequestId) return;

    const sessionId = nextSessionId.current++;
    const deterministicResult = parseCaptureTranscript(normalizedNote, taxonomyQuery.data);
    activeSessionId.current = sessionId;
    setSession({
      id: sessionId,
      transcript: normalizedNote,
      source,
      initialValues: toTaxonomyInitialValues(deterministicResult),
      warnings: deterministicResult.warnings,
    });
    setTranscript(normalizedNote);
    setTranscriptEditorOpen(false);
    setTranscriptRevision(normalizedNote);
    setCleanupSuggestion(null);
    setCleanupError(null);
    setTextFieldsRevealed(false);
    startCleanup(normalizedNote, sessionId);
  }

  function startCleanup(note: string, sessionId: number) {
    abortController.current?.abort();
    const controller = new AbortController();
    const requestId = nextCleanupRequestId.current++;
    abortController.current = controller;
    activeCleanupRequestId.current = requestId;
    setCleanupPending(true);
    setCleanupError(null);
    cleanupMutation.mutate({ note, signal: controller.signal, requestId, sessionId });
  }

  function cancelCleanup() {
    activeCleanupRequestId.current = null;
    abortController.current?.abort();
    abortController.current = null;
    setCleanupPending(false);
  }

  function selectMode(nextMode: CaptureMode) {
    activeParserRequestId.current = null;
    setMode(nextMode);
    setVoiceState(idleVoiceState);

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("mode", nextMode);
    window.history.replaceState(window.history.state, "", `${nextUrl.pathname}${nextUrl.search}`);
  }

  function handleVoiceTranscript(nextTranscript: string) {
    setTranscript(nextTranscript);
    if (taxonomyQuery.data) {
      void beginDraft(nextTranscript, "voice");
      return;
    }
    setPendingVoiceTranscript(nextTranscript);
  }

  function editPendingTranscriptAsText() {
    if (!pendingVoiceTranscript) return;
    setTranscript(pendingVoiceTranscript);
    setPendingVoiceTranscript(null);
    selectMode("text");
  }

  function regenerateFromTranscript() {
    if (!session || transcriptRevision.trim().length < 12) return;
    const confirmed = window.confirm(
      "Regenerating will replace the current drill fields, Training Methods, and tags with a new draft based on this transcript.",
    );
    if (!confirmed) return;
    void beginDraft(transcriptRevision, session.source);
  }

  if (session) {
    const cleanupState: DrillFormCleanupState = cleanupPending
      ? { status: "pending" }
      : cleanupError
        ? {
            status: "error",
            errorMessage: cleanupError,
            onRetry: () => startCleanup(session.transcript, session.id),
          }
        : cleanupSuggestion
          ? {
              status: "ready",
              revision: cleanupSuggestion.revision,
              values: cleanupSuggestion.values,
            }
          : { status: "idle" };

    return (
      <div className={`${styles.scope} ${styles.review}`}>
        <section className={styles.transcriptSection}>
          <div className={styles.transcriptHeading}>
            <div>
              <p className="eyebrow">Original Memo</p>
              <p>{session.source === "voice" ? "Transcribed locally" : "Typed note"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setTranscriptRevision(session.transcript);
                setTranscriptEditorOpen((open) => !open);
              }}
            >
              <PencilSimple size={16} weight="bold" />
              Edit transcript
            </button>
          </div>
          {transcriptEditorOpen ? (
            <div className={styles.transcriptEditor}>
              <textarea
                value={transcriptRevision}
                onChange={(event) => setTranscriptRevision(event.target.value)}
                rows={6}
                aria-label="Edit original transcript"
              />
              <div>
                <button type="button" onClick={() => setTranscriptEditorOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={transcriptRevision.trim().length < 12}
                  onClick={regenerateFromTranscript}
                >
                  Regenerate draft
                </button>
              </div>
            </div>
          ) : (
            <p className={styles.transcriptPreview}>{session.transcript}</p>
          )}
        </section>
        {session.warnings.length > 0 && (
          <section className="capture-warning" aria-label="Draft warnings">
            <p className="eyebrow">Review Notes</p>
            {session.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </section>
        )}
        <AddDrillForm
          key={session.id}
          initialValues={session.initialValues}
          cleanupState={cleanupState}
          textFieldsPending={!textFieldsRevealed}
          onBeforeSave={cancelCleanup}
          onCancel={onRequestExit}
          onSaveSuccess={onSaveSuccess}
        />
      </div>
    );
  }

  if (pendingVoiceTranscript) {
    return (
      <section className={styles.voicePanel} aria-live="polite">
        <p className="eyebrow">Preparing Draft</p>
        <div className={styles.voicePreparingStage}>
          {taxonomyQuery.isError ? (
            <div className={styles.voiceError}>
              <p className="eyebrow">Taxonomy Error</p>
              <p>The recording is safe for this session, but its tags could not be prepared.</p>
              <div>
                <button type="button" onClick={() => void taxonomyQuery.refetch()}>
                  Retry
                </button>
                <button type="button" onClick={editPendingTranscriptAsText}>
                  Edit as text
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.voicePreparingCopy}>
              <p className={styles.voicePreparingStatus}>Preparing drill taxonomy</p>
              <p className={styles.voicePreparingLimit}>Your transcript stays in this capture session.</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (mode === "voice") {
    return (
      <VoiceCapturePanel
        onTranscript={handleVoiceTranscript}
        onUseText={() => selectMode("text")}
        onStateChange={setVoiceState}
      />
    );
  }

  return (
    <form className={`${drillStyles.form} ${styles.scope} ${styles.draftForm}`} onSubmit={handleSubmit}>
      <section className="add-drill-section">
        <p className="eyebrow">Training Note</p>
        <label>
          <span>Describe the drill</span>
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="Example: Coach had us slip outside the cross, step through, throw the left uppercut, then pivot out before the return..."
            rows={9}
          />
        </label>
      </section>

      {taxonomyQuery.isError && (
        <div className="add-drill-error">
          <span>Couldn’t prepare the drill taxonomy.</span>
          <button type="button" onClick={() => void taxonomyQuery.refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="add-drill-actions capture-draft-actions">
        <button type="button" onClick={() => selectMode("voice")}>
          <Microphone size={18} weight="regular" />
          Use microphone
        </button>
        <button type="submit" disabled={!taxonomyQuery.data || transcript.trim().length < 12}>
          {taxonomyQuery.isLoading ? "Preparing" : "Generate draft"}
        </button>
      </div>
    </form>
  );
}

function toTaxonomyInitialValues(
  result: CaptureTaxonomyResult,
): DrillFormInitialValues {
  return {
    trainingMethodSlugs: result.trainingMethodSlugs,
    tagSlugs: result.tagSlugs,
    statusTagSlugs: [],
  };
}

function VoiceCaptureLoading() {
  return (
    <section className={styles.voicePanel} aria-busy="true" aria-label="Loading voice recorder">
      <p className="eyebrow">Voice Memo</p>
      <div className={styles.voiceStage} data-status="idle">
        <div className={styles.voiceConsoleHeader}>
          <span>MIC INPUT</span>
          <span className={styles.voiceConsoleState}>LOADING</span>
        </div>
        <div className={styles.voiceConsoleDisplay}>
          <p className={styles.voiceTimer}>0:00</p>
          <div className={styles.voiceWaveformViewport} />
          <div className={styles.voiceConsoleMessage}>
            <p>Preparing microphone controls</p>
          </div>
        </div>
        <div className={styles.voiceCommandRail} aria-hidden="true" />
      </div>
    </section>
  );
}

function toCleanupValues(draft: CaptureDraft): DrillCleanupValues {
  return {
    title: draft.title,
    summary: draft.summary,
    notes: draft.notes ?? "",
    steps: draft.steps,
  };
}

function getCaptureErrorMessage(error: unknown): string {
  const responseBody = (error as ApiError | undefined)?.responseBody;

  if (responseBody && typeof responseBody === "object" && "error" in responseBody) {
    const setup = "setup" in responseBody ? ` ${String(responseBody.setup)}` : "";
    return `${String(responseBody.error)}${setup}`;
  }

  return "Couldn’t clean up the drill. Enter the text fields manually or retry cleanup.";
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof Error && error.name === "AbortError";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
