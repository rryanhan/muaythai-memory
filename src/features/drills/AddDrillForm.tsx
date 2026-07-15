"use client";

import { useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { badgeByIconKey } from "@/components/shared/context-badges";
import skeletonStyles from "@/components/shared/Skeleton.module.css";
import captureStyles from "@/features/capture/Capture.module.css";
import {
  createDrill,
  getTaxonomy,
  updateDrill,
  type ApiError,
  type DrillDetail,
  type StatusTagDto,
  type TrainingMethodDto,
} from "@/data";
import { AddDrillSkeleton } from "./AddDrillSkeleton";
import {
  hasPendingDrillCleanup,
  mergeDrillCleanup,
  type DrillCleanupField,
  type DrillCleanupValues,
  type DrillDirtyFields,
  type PendingDrillCleanup,
} from "./cleanup-merge";
import styles from "./DrillForm.module.css";

type AddDrillFormProps = {
  mode?: "create" | "edit";
  initialDrill?: DrillDetail;
  initialValues?: DrillFormInitialValues;
  cleanupState?: DrillFormCleanupState;
  textFieldsPending?: boolean;
  onBeforeSave?: () => void;
  onCancel?: () => void;
  onSaveSuccess?: (drillId: string) => void;
};

export type DrillFormCleanupState = {
  status: "idle" | "pending" | "ready" | "error";
  revision?: number;
  values?: DrillCleanupValues;
  errorMessage?: string;
  onRetry?: () => void;
};

export type DrillFormInitialValues = {
  title?: string;
  summary?: string | null;
  notes?: string | null;
  steps?: string[];
  trainingMethodSlugs?: string[];
  tagSlugs?: string[];
  statusTagSlugs?: string[];
};

export function AddDrillForm({
  mode = "create",
  initialDrill,
  initialValues,
  cleanupState,
  textFieldsPending = false,
  onBeforeSave,
  onCancel,
  onSaveSuccess,
}: AddDrillFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEditMode = mode === "edit";
  const formInitialValues = useMemo(
    () => initialValues ?? toInitialValues(initialDrill),
    [initialDrill, initialValues],
  );
  const [title, setTitle] = useState(formInitialValues.title ?? "");
  const [summary, setSummary] = useState(formInitialValues.summary ?? "");
  const [notes, setNotes] = useState(formInitialValues.notes ?? "");
  const [steps, setSteps] = useState(() => {
    const initialSteps = formInitialValues.steps?.filter(Boolean) ?? [];
    return initialSteps.length > 0 ? initialSteps : [""];
  });
  const [trainingMethodSlugs, setTrainingMethodSlugs] = useState<string[]>(
    () => formInitialValues.trainingMethodSlugs ?? [],
  );
  const [tagSlugs, setTagSlugs] = useState<string[]>(() => formInitialValues.tagSlugs ?? []);
  const [statusTagSlugs, setStatusTagSlugs] = useState<string[]>(() => formInitialValues.statusTagSlugs ?? []);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [pendingCleanup, setPendingCleanup] = useState<PendingDrillCleanup>({});
  const lastCleanupRevision = useRef<number | null>(null);
  const dirtyFields = useRef<DrillDirtyFields>({
    title: false,
    summary: false,
    notes: false,
    steps: false,
  });
  const taxonomyQuery = useQuery({
    queryKey: ["taxonomy"],
    queryFn: ({ signal }) => getTaxonomy({ requestInit: { signal } }),
    staleTime: 10 * 60 * 1000,
  });
  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof createDrill>[0]) => {
      if (isEditMode) {
        if (!initialDrill) throw new Error("Missing drill to update.");
        return updateDrill(initialDrill.id, input);
      }

      return createDrill(input);
    },
    onSuccess: async (drill) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["drills"] }),
        queryClient.invalidateQueries({ queryKey: ["graph"] }),
        queryClient.invalidateQueries({ queryKey: ["drill", drill.id] }),
      ]);
      if (onSaveSuccess) {
        onSaveSuccess(drill.id);
        return;
      }
      router.push(`/drills/${drill.id}`);
      router.refresh();
    },
  });
  const taxonomy = taxonomyQuery.data;
  const standardTagCategories = taxonomy?.tagCategories ?? [];
  const customTags = taxonomy?.customTags ?? [];
  const statusTags = taxonomy?.statusTags ?? [];
  const selectedMethods = useMemo(() => new Set(trainingMethodSlugs), [trainingMethodSlugs]);
  const selectedTags = useMemo(() => new Set(tagSlugs), [tagSlugs]);
  const selectedStatuses = useMemo(() => new Set(statusTagSlugs), [statusTagSlugs]);

  useLayoutEffect(() => {
    if (
      cleanupState?.status !== "ready" ||
      cleanupState.revision === undefined ||
      !cleanupState.values ||
      cleanupState.revision === lastCleanupRevision.current
    ) {
      return;
    }

    lastCleanupRevision.current = cleanupState.revision;
    const merged = mergeDrillCleanup(
      { title, summary, notes, steps },
      dirtyFields.current,
      cleanupState.values,
    );

    setTitle(merged.applied.title);
    setSummary(merged.applied.summary);
    setNotes(merged.applied.notes);
    setSteps(merged.applied.steps);
    setPendingCleanup(merged.pending);
    // A cleanup revision is a one-time event. Including live form state here
    // would re-run the merge after each keystroke and risk overwriting edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupState?.revision]);

  function markDirty(field: DrillCleanupField) {
    dirtyFields.current[field] = true;
  }

  function updateStep(index: number, value: string) {
    markDirty("steps");
    setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? value : step)));
  }

  function addStep() {
    markDirty("steps");
    setSteps((current) => [...current, ""]);
  }

  function removeStep(index: number) {
    markDirty("steps");
    setSteps((current) => (current.length === 1 ? current : current.filter((_, stepIndex) => stepIndex !== index)));
  }

  function applyCleanupField(field: DrillCleanupField) {
    const value = pendingCleanup[field];
    if (value === undefined) return;

    if (field === "title") setTitle(value as string);
    if (field === "summary") setSummary(value as string);
    if (field === "notes") setNotes(value as string);
    if (field === "steps") setSteps(value as string[]);
    markDirty(field);
    setPendingCleanup((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function applyAllCleanup() {
    for (const field of ["title", "summary", "notes", "steps"] as const) {
      if (pendingCleanup[field] !== undefined) applyCleanupField(field);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedSteps = steps.map((step) => step.trim()).filter(Boolean);
    const validationMessage = getValidationMessage({
      title,
      steps: trimmedSteps,
      trainingMethodSlugs,
    });

    if (validationMessage) {
      setFormMessage(validationMessage);
      return;
    }

    setFormMessage(null);
    onBeforeSave?.();
    saveMutation.mutate({
      title,
      summary,
      notes,
      steps: trimmedSteps,
      trainingMethodSlugs,
      tagSlugs,
      statusTagSlugs,
    });
  }

  if (taxonomyQuery.isLoading) {
    return <AddDrillSkeleton />;
  }

  if (taxonomyQuery.isError) {
    return (
      <AddDrillState title="Couldn’t load form" body="The taxonomy request failed.">
        <button type="button" onClick={() => void taxonomyQuery.refetch()}>
          Retry
        </button>
      </AddDrillState>
    );
  }

  return (
    <form className={`${styles.form} ${cleanupState ? captureStyles.scope : ""}`} onSubmit={handleSubmit}>
      {textFieldsPending ? (
        <CaptureTextLoading />
      ) : (
        <>
          <section className="add-drill-section">
            <p className="eyebrow">Drill Info</p>
            <label>
              <span>Title</span>
              <input
                value={title}
                onChange={(event) => {
                  markDirty("title");
                  setTitle(event.target.value);
                }}
                placeholder="Slip right uppercut exit"
              />
            </label>
            <label>
              <span>Summary optional</span>
              <textarea
                value={summary}
                onChange={(event) => {
                  markDirty("summary");
                  setSummary(event.target.value);
                }}
                placeholder="What this drill is for, if a short recap helps."
                rows={3}
              />
            </label>
            <label>
              <span>Notes</span>
              <textarea
                value={notes}
                onChange={(event) => {
                  markDirty("notes");
                  setNotes(event.target.value);
                }}
                placeholder="Coach cues, specifics, common mistakes, or reminders."
                rows={4}
              />
            </label>
          </section>

          <section className="add-drill-section">
            <p className="eyebrow">Steps</p>
            <div className="add-drill-step-list">
              {steps.map((step, index) => (
                <div key={index} className="add-drill-step-row">
                  <span>{index + 1}</span>
                  <input
                    value={step}
                    onChange={(event) => updateStep(index, event.target.value)}
                    placeholder={index === 0 ? "Start with..." : "Next step"}
                  />
                  <button type="button" disabled={steps.length === 1} onClick={() => removeStep(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="add-drill-secondary-button" onClick={addStep}>
              Add step
            </button>
          </section>
        </>
      )}

      <section className="add-drill-section">
        <p className="eyebrow">Training Method</p>
        <div className="add-drill-method-grid">
          {taxonomy?.trainingMethods.map((method) => (
            <MethodToken
              key={method.id}
              method={method}
              selected={selectedMethods.has(method.slug)}
              onToggle={() => setTrainingMethodSlugs((current) => toggleSlug(current, method.slug))}
            />
          ))}
        </div>
      </section>

      <section className="add-drill-section">
        <p className="eyebrow">Tags</p>
        <div className="add-drill-tag-index">
          {standardTagCategories.map((category) => (
            <section key={category.id}>
              <h3>{category.name}</h3>
              <div>
                {category.tags.map((tag) => (
                  <TagToken
                    key={tag.id}
                    label={tag.name}
                    selected={selectedTags.has(tag.slug)}
                    onToggle={() => setTagSlugs((current) => toggleSlug(current, tag.slug))}
                  />
                ))}
              </div>
            </section>
          ))}
          {customTags.length > 0 && (
            <section>
              <h3>Custom Tags</h3>
              <div>
                {customTags.map((tag) => (
                  <TagToken
                    key={tag.id}
                    label={tag.name}
                    selected={selectedTags.has(tag.slug)}
                    onToggle={() => setTagSlugs((current) => toggleSlug(current, tag.slug))}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </section>

      <section className="add-drill-section">
        <p className="eyebrow">Saved Lists</p>
        <div className="add-drill-inline-tokens">
          {statusTags.map((status) => (
            <StatusToken
              key={status.id}
              status={status}
              selected={selectedStatuses.has(status.slug)}
              onToggle={() => setStatusTagSlugs((current) => toggleSlug(current, status.slug))}
            />
          ))}
        </div>
      </section>

      {cleanupState && cleanupState.status !== "idle" && !(textFieldsPending && cleanupState.status === "pending") && (
        <CleanupState
          state={cleanupState}
          pending={pendingCleanup}
          onApplyField={applyCleanupField}
          onApplyAll={applyAllCleanup}
        />
      )}

      {(formMessage || saveMutation.isError) && (
        <p className="add-drill-error">{formMessage ?? getMutationErrorMessage(saveMutation.error)}</p>
      )}

      <div className="add-drill-actions">
        <button type="button" onClick={() => (onCancel ? onCancel() : router.back())}>
          Cancel
        </button>
        <button type="submit" disabled={saveMutation.isPending || textFieldsPending}>
          {textFieldsPending
            ? "Cleaning up"
            : saveMutation.isPending
              ? isEditMode
                ? "Updating"
                : "Saving"
              : isEditMode
                ? "Update drill"
                : "Save drill"}
        </button>
      </div>
    </form>
  );
}

function MethodToken({
  method,
  selected,
  onToggle,
}: {
  method: TrainingMethodDto;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" data-selected={selected} onClick={onToggle}>
      <img src={badgeByIconKey[method.iconKey]} alt="" aria-hidden="true" />
      <span>{method.name}</span>
    </button>
  );
}

function TagToken({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" data-selected={selected} onClick={onToggle}>
      {label}
    </button>
  );
}

function StatusToken({
  status,
  selected,
  onToggle,
}: {
  status: StatusTagDto;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" data-selected={selected} onClick={onToggle}>
      {status.name}
    </button>
  );
}

function CleanupState({
  state,
  pending,
  onApplyField,
  onApplyAll,
}: {
  state: DrillFormCleanupState;
  pending: PendingDrillCleanup;
  onApplyField: (field: DrillCleanupField) => void;
  onApplyAll: () => void;
}) {
  if (state.status === "pending") {
    return (
      <section className="capture-cleanup-state" aria-live="polite">
        <p className="eyebrow">AI Cleanup</p>
        <p>Cleaning up the wording in the background. You can keep editing or save now.</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="capture-cleanup-state capture-cleanup-state-error" aria-live="polite">
        <p className="eyebrow">Cleanup Unavailable</p>
        <p>{state.errorMessage ?? "The immediate draft is still ready to edit and save."}</p>
        {state.onRetry && (
          <button type="button" onClick={state.onRetry}>
            Retry cleanup
          </button>
        )}
      </section>
    );
  }

  if (state.status !== "ready") return null;

  if (!hasPendingDrillCleanup(pending)) {
    return null;
  }

  return (
    <section className="capture-cleanup-state" aria-live="polite">
      <div className="capture-cleanup-heading">
        <div>
          <p className="eyebrow">Cleanup Ready</p>
          <p>Your edits were kept. Review the remaining suggestions.</p>
        </div>
        <button type="button" onClick={onApplyAll}>
          Apply all
        </button>
      </div>
      <div className="capture-cleanup-suggestions">
        {(["title", "summary", "notes", "steps"] as const).map((field) => {
          const value = pending[field];
          if (value === undefined) return null;

          return (
            <article key={field}>
              <div>
                <h3>{cleanupFieldLabel[field]}</h3>
                <button type="button" onClick={() => onApplyField(field)}>
                  Apply
                </button>
              </div>
              {field === "steps" ? (
                <ol>
                  {(value as string[]).map((step, index) => (
                    <li key={`${step}-${index}`}>{step}</li>
                  ))}
                </ol>
              ) : (
                <p>{(value as string) || "Clear this field."}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CaptureTextLoading() {
  const skeletonClassName = `${skeletonStyles.skeleton} drill-detail-skeleton`;

  return (
    <div className="capture-text-loading" aria-live="polite" aria-busy="true">
      <section className="capture-cleaning-banner">
        <p className="eyebrow">Cleaning up...</p>
        <p>Training Methods and tags are ready to edit while AI organizes the drill.</p>
      </section>
      <section className="add-drill-section" aria-label="Cleaning drill information">
        <p className="eyebrow">Drill Info</p>
        <div className="capture-text-loading-fields" aria-hidden="true">
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
        </div>
      </section>
      <section className="add-drill-section" aria-label="Cleaning drill steps">
        <p className="eyebrow">Steps</p>
        <div className="capture-text-loading-steps" aria-hidden="true">
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
          <span className={skeletonClassName} />
        </div>
      </section>
    </div>
  );
}

const cleanupFieldLabel: Record<DrillCleanupField, string> = {
  title: "Title",
  summary: "Summary",
  notes: "Notes",
  steps: "Steps",
};

function toInitialValues(drill: DrillDetail | undefined): DrillFormInitialValues {
  if (!drill) return {};

  return {
    title: drill.title,
    summary: drill.summary,
    notes: drill.notes,
    steps: drill.steps.map((step) => step.body),
    trainingMethodSlugs: drill.trainingMethods.map((method) => method.slug),
    tagSlugs: [...drill.tags, ...drill.customTags].map((tag) => tag.slug),
    statusTagSlugs: drill.statusTags.map((status) => status.slug),
  };
}

function AddDrillState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.state}>
      <p className="eyebrow">Add Drill</p>
      <h2>{title}</h2>
      <p>{body}</p>
      {children}
    </section>
  );
}

function toggleSlug(current: string[], slug: string): string[] {
  return current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
}

function getValidationMessage(input: {
  title: string;
  steps: string[];
  trainingMethodSlugs: string[];
}): string | null {
  if (!input.title.trim()) return "Add a title before saving.";
  if (input.steps.length === 0) return "Add at least one step before saving.";
  if (input.trainingMethodSlugs.length === 0) return "Choose at least one Training Method.";
  return null;
}

function getMutationErrorMessage(error: unknown): string {
  const responseBody = (error as ApiError | undefined)?.responseBody;

  if (responseBody && typeof responseBody === "object" && "error" in responseBody) {
    return String(responseBody.error);
  }

  return "Couldn’t save this drill. Check the fields and try again.";
}
