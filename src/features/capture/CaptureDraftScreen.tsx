"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import type { AppView } from "@/components/navigation/BottomNav";
import type { CreateDrillInput, DrillDetail } from "@/data/types";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import { CaptureDiscardSheet } from "./CaptureDiscardSheet";
import {
  CaptureDraftForm,
  type CaptureMode,
  type CaptureWorkflowState,
} from "./CaptureDraftForm";
import type { CaptureMethodCoach } from "./VoiceCapturePanel";
import styles from "./Capture.module.css";

export type CaptureOrigin = "network" | "library";

type CaptureDraftScreenProps = {
  initialMode: CaptureMode;
  origin: CaptureOrigin;
  onboarding?: CaptureOnboardingConfig;
};

export type CaptureOnboardingConfig = {
  createAction: (input: CreateDrillInput) => Promise<DrillDetail>;
  methodCoach?: CaptureMethodCoach;
  onUseManual: () => void;
  onSkipFirstDrill: () => Promise<string | null>;
};

type PendingNavigation =
  | { kind: "route"; destination: string }
  | { kind: "history" }
  | { kind: "skip" }
  | null;

const phaseCopy: Record<CaptureWorkflowState["phase"], string> = {
  input: "Record the messy version.",
  processing: "Turning your memo into a drill.",
  review: "Check the transcript and drill before saving.",
};

export function CaptureDraftScreen({ initialMode, origin, onboarding }: CaptureDraftScreenProps) {
  const router = useRouter();
  const originRoute = origin === "network" ? "/" : "/?view=library";
  const activeView: AppView = origin;
  const [workflow, setWorkflow] = useState<CaptureWorkflowState>({
    mode: initialMode,
    phase: "input",
    hasUnsavedWork: false,
  });
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const [creationCommitting, setCreationCommitting] = useState(false);
  const [skipCommitting, setSkipCommitting] = useState(false);
  const dirtyRef = useRef(false);
  const creationCommittingRef = useRef(false);
  const skipCommittingRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const atGuardEntryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = workflow.hasUnsavedWork;
    creationCommittingRef.current = creationCommitting;
    skipCommittingRef.current = skipCommitting;
    const guarded = workflow.hasUnsavedWork || creationCommitting || skipCommitting;

    if (guarded && !guardKeyRef.current) {
      const guardKey = `capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      guardKeyRef.current = guardKey;
      atGuardEntryRef.current = true;
      window.history.pushState(
        { ...window.history.state, __captureGuard: guardKey },
        "",
        window.location.href,
      );
      return;
    }

    if (!guarded && guardKeyRef.current) {
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      if (atGuardEntryRef.current && window.history.state?.__captureGuard === guardKey) {
        ignoreNextPopRef.current = true;
        atGuardEntryRef.current = false;
        window.history.back();
      }
    }
  }, [creationCommitting, skipCommitting, workflow.hasUnsavedWork]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current && !creationCommittingRef.current && !skipCommittingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handlePopState(event: PopStateEvent) {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        atGuardEntryRef.current = event.state?.__captureGuard === guardKeyRef.current;
        return;
      }

      const guardKey = guardKeyRef.current;
      if (creationCommittingRef.current || skipCommittingRef.current) {
        if (event.state?.__captureGuard === guardKey) {
          atGuardEntryRef.current = true;
          return;
        }
        atGuardEntryRef.current = false;
        ignoreNextPopRef.current = true;
        window.history.forward();
        return;
      }
      if (!dirtyRef.current || !guardKey) return;
      if (event.state?.__captureGuard === guardKey) {
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

  const runWithoutPrompt = useCallback(
    (action: () => void) => {
      dirtyRef.current = false;
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;

      if (guardKey && atGuardEntryRef.current && window.history.state?.__captureGuard === guardKey) {
        ignoreNextPopRef.current = true;
        window.addEventListener(
          "popstate",
          () => {
            action();
          },
          { once: true },
        );
        window.history.back();
        return;
      }

      action();
    },
    [],
  );

  const navigateWithoutPrompt = useCallback(
    (destination: string) => {
      runWithoutPrompt(() => router.replace(destination));
    },
    [router, runWithoutPrompt],
  );

  const requestNavigation = useCallback(
    (destination: string) => {
      if (creationCommittingRef.current || skipCommittingRef.current) return;
      if (!dirtyRef.current) {
        navigateWithoutPrompt(destination);
        return;
      }

      setPendingNavigation({ kind: "route", destination });
      setDiscardOpen(true);
    },
    [navigateWithoutPrompt],
  );

  function keepCapture() {
    if (creationCommittingRef.current || skipCommittingRef.current) return;
    if (pendingNavigation?.kind === "history" && !atGuardEntryRef.current) {
      ignoreNextPopRef.current = true;
      atGuardEntryRef.current = true;
      window.history.forward();
    }
    setDiscardOpen(false);
    setPendingNavigation(null);
  }

  function discardCapture() {
    if (creationCommittingRef.current || skipCommittingRef.current) return;
    const navigation = pendingNavigation;
    setDiscardOpen(false);
    setPendingNavigation(null);

    if (navigation?.kind === "history") {
      dirtyRef.current = false;
      guardKeyRef.current = null;
      ignoreNextPopRef.current = true;
      window.history.back();
      return;
    }

    if (navigation?.kind === "skip" && onboarding) {
      skipCommittingRef.current = true;
      setSkipCommitting(true);
      void onboarding.onSkipFirstDrill()
        .then((destination) => {
          if (destination) {
            navigateWithoutPrompt(destination);
            return;
          }
          skipCommittingRef.current = false;
          setSkipCommitting(false);
        })
        .catch(() => {
          skipCommittingRef.current = false;
          setSkipCommitting(false);
        });
      return;
    }

    navigateWithoutPrompt(navigation?.kind === "route" ? navigation.destination : originRoute);
  }

  function requestSkipFirstDrill() {
    if (creationCommittingRef.current || skipCommittingRef.current) return;
    setPendingNavigation({ kind: "skip" });
    setDiscardOpen(true);
  }

  return (
    <main className={routeStyles.formPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <button
          type="button"
          className="drill-detail-page-back"
          aria-label="Exit Capture Drill"
          disabled={creationCommitting || skipCommitting}
          onClick={() => (onboarding ? requestSkipFirstDrill() : requestNavigation(originRoute))}
        >
          <span aria-hidden="true">←</span>
        </button>
        <p className="eyebrow">Capture Drill</p>
      </header>
      <section className="add-drill-heading">
        <h1>Capture Drill</h1>
        <p>{phaseCopy[workflow.phase]}</p>
      </section>
      <CaptureDraftForm
        initialMode={initialMode}
        onWorkflowChange={setWorkflow}
        onRequestExit={() => requestNavigation(originRoute)}
        onSaveSuccess={(drillId) => navigateWithoutPrompt(`/drills/${drillId}`)}
        onCreationCommitChange={(committing) => {
          creationCommittingRef.current = committing;
          setCreationCommitting(committing);
        }}
        createAction={onboarding?.createAction}
        methodCoach={onboarding?.methodCoach}
        onUseManual={onboarding?.onUseManual}
        returnToVoiceOnCancel={Boolean(onboarding)}
      />
      {onboarding ? (
        <button
          className={styles.skipFirstDrill}
          type="button"
          disabled={creationCommitting || skipCommitting}
          onClick={requestSkipFirstDrill}
        >
          Skip first drill
        </button>
      ) : (
        <RoutedBottomNav
          activeView={activeView}
          onNavigate={(destination) => requestNavigation(destination)}
        />
      )}
      <CaptureDiscardSheet
        open={discardOpen}
        onStay={keepCapture}
        onDiscard={discardCapture}
        title={pendingNavigation?.kind === "skip" ? "Skip your first drill?" : undefined}
        description={pendingNavigation?.kind === "skip"
          ? "You can reopen this guide later from Training Log. Any recording or unsaved drill will be discarded."
          : undefined}
        discardLabel={pendingNavigation?.kind === "skip" ? "Skip for now" : undefined}
      />
    </main>
  );
}
