"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createCaptureDraft, getTaxonomy, type ApiError, type CaptureDraft } from "@/data";
import {
  AddDrillForm,
  type DrillFormCleanupState,
  type DrillFormInitialValues,
} from "@/features/drills/AddDrillForm";
import type { DrillCleanupValues } from "@/features/drills/cleanup-merge";
import drillStyles from "@/features/drills/DrillForm.module.css";
import { parseCaptureTranscript } from "@/modules/capture/parser";
import styles from "./Capture.module.css";

type CaptureSession = {
  id: number;
  transcript: string;
  initialValues: DrillFormInitialValues;
  warnings: string[];
};

type CleanupSuggestion = {
  revision: number;
  values: DrillCleanupValues;
};

export function CaptureDraftForm() {
  const [transcript, setTranscript] = useState("");
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [cleanupSuggestion, setCleanupSuggestion] = useState<CleanupSuggestion | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [textFieldsRevealed, setTextFieldsRevealed] = useState(false);
  const abortController = useRef<AbortController | null>(null);
  const nextSessionId = useRef(1);
  const nextCleanupRevision = useRef(1);
  const taxonomyQuery = useQuery({
    queryKey: ["taxonomy"],
    queryFn: ({ signal }) => getTaxonomy({ requestInit: { signal } }),
    staleTime: 10 * 60 * 1000,
  });
  const cleanupMutation = useMutation({
    mutationFn: ({ note, signal }: { note: string; signal: AbortSignal }) =>
      createCaptureDraft({ transcript: note }, { requestInit: { signal } }),
    onSuccess: (response) => {
      setCleanupSuggestion({
        revision: nextCleanupRevision.current++,
        values: toCleanupValues(response.draft),
      });
      setTextFieldsRevealed(true);
      setCleanupError(null);
      setSession((current) =>
        current
          ? {
              ...current,
              warnings: unique([...current.warnings, ...response.warnings]),
            }
          : current,
      );
    },
    onError: (error) => {
      if (isAbortError(error)) return;
      setTextFieldsRevealed(true);
      setCleanupError(getCaptureErrorMessage(error));
    },
  });

  useEffect(() => {
    return () => abortController.current?.abort();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taxonomyQuery.data) return;

    const deterministicResult = parseCaptureTranscript(transcript, taxonomyQuery.data);
    setSession({
      id: nextSessionId.current++,
      transcript,
      initialValues: toTaxonomyInitialValues(deterministicResult),
      warnings: deterministicResult.warnings,
    });
    setCleanupSuggestion(null);
    setCleanupError(null);
    setTextFieldsRevealed(false);
    startCleanup(transcript);
  }

  function startCleanup(note: string) {
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    setCleanupError(null);
    cleanupMutation.mutate({ note, signal: controller.signal });
  }

  function cancelCleanup() {
    abortController.current?.abort();
    abortController.current = null;
  }

  if (session) {
    const cleanupState: DrillFormCleanupState = cleanupMutation.isPending
      ? { status: "pending" }
      : cleanupError
        ? {
            status: "error",
            errorMessage: cleanupError,
            onRetry: () => startCleanup(session.transcript),
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
        />
      </div>
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
        <button type="button" onClick={() => setTranscript("")} disabled={!transcript.trim()}>
          Clear
        </button>
        <button type="submit" disabled={!taxonomyQuery.data || transcript.trim().length < 12}>
          {taxonomyQuery.isLoading ? "Preparing" : "Generate draft"}
        </button>
      </div>
    </form>
  );
}

function toTaxonomyInitialValues(
  result: ReturnType<typeof parseCaptureTranscript>,
): DrillFormInitialValues {
  return {
    trainingMethodSlugs: result.trainingMethodSlugs,
    tagSlugs: result.tagSlugs,
    statusTagSlugs: [],
  };
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
