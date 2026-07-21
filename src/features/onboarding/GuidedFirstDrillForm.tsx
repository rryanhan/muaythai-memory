"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { badgeByIconKey } from "@/components/shared/context-badges";
import { createOnboardingFirstDrill, skipOnboardingFirstDrill } from "@/data/onboarding";
import { getTaxonomy } from "@/data/taxonomy";
import styles from "./Onboarding.module.css";

const stageCopy = [
  ["Training Method", "Where will you practice this drill? Choose every method that applies."],
  ["Name the drill", "Give it a name you will recognize later. Summary and notes can stay rough."],
  ["Build the sequence", "Write the physical actions in order. One useful step is enough to begin."],
  ["Organize it", "Tags and Saved Lists are optional. They make the drill easier to find later."],
] as const;

export function GuidedFirstDrillForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState(0);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [steps, setSteps] = useState([""]);
  const [methodSlugs, setMethodSlugs] = useState<string[]>([]);
  const [tagSlugs, setTagSlugs] = useState<string[]>([]);
  const [statusSlugs, setStatusSlugs] = useState<string[]>([]);
  const [pending, setPending] = useState<"save" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const dirtyRef = useRef(false);
  const taxonomyQuery = useQuery({ queryKey: ["taxonomy"], queryFn: ({ signal }) => getTaxonomy({ requestInit: { signal } }), staleTime: 10 * 60 * 1000 });
  const taxonomy = taxonomyQuery.data;
  const selectedMethods = useMemo(() => new Set(methodSlugs), [methodSlugs]);
  const selectedTags = useMemo(() => new Set(tagSlugs), [tagSlugs]);
  const selectedStatuses = useMemo(() => new Set(statusSlugs), [statusSlugs]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function popState() {
      if (!dirtyRef.current) return;
      if (!window.confirm("Leave the first drill guide? Your unsaved drill will be lost.")) window.history.forward();
      else dirtyRef.current = false;
    }
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", popState);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", popState); };
  }, []);

  function change(mutator: () => void) { dirtyRef.current = true; setError(null); mutator(); }

  function nextStage() {
    const message = validateStage(stage);
    if (message) return setError(message);
    setError(null);
    setStage((current) => Math.min(3, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateStage(current: number): string | null {
    if (current === 0 && methodSlugs.length === 0) return "Choose at least one Training Method.";
    if (current === 1 && !title.trim()) return "Give the drill a title.";
    if (current === 2 && !steps.some((step) => step.trim())) return "Add at least one drill step.";
    return null;
  }

  async function save() {
    const message = validateStage(0) ?? validateStage(1) ?? validateStage(2);
    if (message) return setError(message);
    setPending("save");
    setError(null);
    try {
      const drill = await createOnboardingFirstDrill({ title, summary, notes, steps: steps.map((value) => value.trim()).filter(Boolean), trainingMethodSlugs: methodSlugs, tagSlugs, statusTagSlugs: statusSlugs });
      dirtyRef.current = false;
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["drills"] }), queryClient.invalidateQueries({ queryKey: ["graph"] })]);
      router.replace(`/drills/${drill.id}`);
      router.refresh();
    } catch (caught) {
      setPending(null);
      setError(caught instanceof Error ? caught.message : "Your first drill could not be saved.");
    }
  }

  async function skip() {
    setPending("skip");
    setError(null);
    try {
      await skipOnboardingFirstDrill();
      dirtyRef.current = false;
      router.replace(nextPath === "/" ? "/?view=library" : nextPath);
      router.refresh();
    } catch (caught) {
      setPending(null);
      setConfirmSkip(false);
      setError(caught instanceof Error ? caught.message : "The guide could not be skipped.");
    }
  }

  if (taxonomyQuery.isPending) return <div className={styles.loading}>Preparing your drill guide...</div>;
  if (taxonomyQuery.isError || !taxonomy) return <div className={styles.loading}><button type="button" onClick={() => void taxonomyQuery.refetch()}>Couldn’t load the guide. Retry</button></div>;

  return <>
    <div className={styles.stepNav} aria-label={`Guide step ${stage + 1} of 4`}>{[0,1,2,3].map((index) => <span key={index} data-active={index <= stage} />)}</div>
    <header className={styles.heading}><h1>{stageCopy[stage][0]}</h1><p>{stageCopy[stage][1]}</p></header>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); stage < 3 ? nextStage() : void save(); }}>
      {stage === 0 && <section className={styles.methodGrid}>{taxonomy.trainingMethods.map((method) => <button key={method.id} type="button" data-selected={selectedMethods.has(method.slug)} onClick={() => change(() => setMethodSlugs((current) => toggle(current, method.slug)))}><img src={badgeByIconKey[method.iconKey]} alt="" /><span>{method.name}</span></button>)}</section>}
      {stage === 1 && <section className={styles.fields}>
        <label><span>Title</span><input autoFocus value={title} placeholder="Jab, cross, rear kick" onChange={(event) => change(() => setTitle(event.target.value))} /></label>
        <label><span>Summary optional</span><textarea rows={3} value={summary} placeholder="What this drill practices." onChange={(event) => change(() => setSummary(event.target.value))} /></label>
        <label><span>Notes optional</span><textarea rows={4} value={notes} placeholder="Coaching cues, reminders, and common mistakes." onChange={(event) => change(() => setNotes(event.target.value))} /></label>
      </section>}
      {stage === 2 && <section className={styles.fields}><div className={styles.steps}>{steps.map((step, index) => <div className={styles.stepRow} key={index}><span>{index + 1}</span><input autoFocus={index === 0} value={step} placeholder={index === 0 ? "Start with..." : "Next step"} onChange={(event) => change(() => setSteps((current) => current.map((value, stepIndex) => stepIndex === index ? event.target.value : value)))} /><button type="button" disabled={steps.length === 1} onClick={() => change(() => setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index)))}>Remove</button></div>)}</div><button className={styles.addStep} type="button" onClick={() => change(() => setSteps((current) => [...current, ""]))}>Add step</button></section>}
      {stage === 3 && <div className={styles.tagGroups}>
        <section className={styles.tagGroup}><h3>Saved Lists</h3><div className={styles.tokens}>{taxonomy.statusTags.map((status) => <button key={status.id} type="button" data-selected={selectedStatuses.has(status.slug)} onClick={() => change(() => setStatusSlugs((current) => toggle(current, status.slug)))}>{status.name}</button>)}</div></section>
        {taxonomy.tagCategories.map((category) => <section className={styles.tagGroup} key={category.id}><h3>{category.name}</h3><div className={styles.tokens}>{category.tags.map((tag) => <button key={tag.id} type="button" data-selected={selectedTags.has(tag.slug)} onClick={() => change(() => setTagSlugs((current) => toggle(current, tag.slug)))}>{tag.name}</button>)}</div></section>)}
      </div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        {stage === 0 ? <button type="button" onClick={() => setConfirmSkip(true)}>Skip guide</button> : <button type="button" onClick={() => { setStage((current) => current - 1); setError(null); }}>Back</button>}
        <button type="submit" disabled={pending !== null}>{pending === "save" ? "Saving..." : stage === 3 ? "Save first drill" : "Continue"}</button>
      </div>
    </form>
    {confirmSkip && <div className={styles.confirmBackdrop} role="presentation"><section className={styles.confirmPanel} role="dialog" aria-modal="true" aria-labelledby="skip-guide-title"><p className="eyebrow">First Drill Guide</p><h2 id="skip-guide-title">Skip for now?</h2><p>You can reopen this guide later from Training Log.</p><div className={styles.actions}><button type="button" onClick={() => setConfirmSkip(false)}>Keep going</button><button type="button" disabled={pending !== null} onClick={() => void skip()}>{pending === "skip" ? "Skipping..." : "Skip guide"}</button></div></section></div>}
  </>;
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
