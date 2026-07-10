"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { badgeByIconKey } from "@/components/shared/context-badges";
import {
  createDrill,
  getTaxonomy,
  type ApiError,
  type StatusTagDto,
  type TrainingMethodDto,
} from "@/data";
import { AddDrillSkeleton } from "./AddDrillSkeleton";

export function AddDrillForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [steps, setSteps] = useState([""]);
  const [trainingMethodSlugs, setTrainingMethodSlugs] = useState<string[]>([]);
  const [tagSlugs, setTagSlugs] = useState<string[]>([]);
  const [statusTagSlugs, setStatusTagSlugs] = useState<string[]>([]);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const taxonomyQuery = useQuery({
    queryKey: ["taxonomy"],
    queryFn: ({ signal }) => getTaxonomy({ requestInit: { signal } }),
    staleTime: 10 * 60 * 1000,
  });
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createDrill>[0]) => createDrill(input),
    onSuccess: async (drill) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["drills"] }),
        queryClient.invalidateQueries({ queryKey: ["graph"] }),
      ]);
      router.push(`/drills/${drill.id}`);
    },
  });
  const taxonomy = taxonomyQuery.data;
  const standardTagCategories = taxonomy?.tagCategories ?? [];
  const customTags = taxonomy?.customTags ?? [];
  const statusTags = taxonomy?.statusTags ?? [];
  const selectedMethods = useMemo(() => new Set(trainingMethodSlugs), [trainingMethodSlugs]);
  const selectedTags = useMemo(() => new Set(tagSlugs), [tagSlugs]);
  const selectedStatuses = useMemo(() => new Set(statusTagSlugs), [statusTagSlugs]);

  function updateStep(index: number, value: string) {
    setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? value : step)));
  }

  function addStep() {
    setSteps((current) => [...current, ""]);
  }

  function removeStep(index: number) {
    setSteps((current) => (current.length === 1 ? current : current.filter((_, stepIndex) => stepIndex !== index)));
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
    createMutation.mutate({
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
    <form className="add-drill-form" onSubmit={handleSubmit}>
      <section className="add-drill-section">
        <p className="eyebrow">Drill Info</p>
        <label>
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Slip right uppercut exit" />
        </label>
        <label>
          <span>Summary optional</span>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="What this drill is for, if a short recap helps."
            rows={3}
          />
        </label>
        <label>
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
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

      {(formMessage || createMutation.isError) && (
        <p className="add-drill-error">{formMessage ?? getMutationErrorMessage(createMutation.error)}</p>
      )}

      <div className="add-drill-actions">
        <button type="button" onClick={() => router.back()}>
          Cancel
        </button>
        <button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Saving" : "Save drill"}
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
    <section className="add-drill-state">
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
