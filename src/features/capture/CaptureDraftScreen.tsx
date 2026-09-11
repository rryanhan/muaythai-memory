"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import type { AppView } from "@/components/navigation/BottomNav";
import type { CreateDrillInput, DrillDetail } from "@/data/types";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import { DiscardSheetFallback } from "@/features/media/DiscardSheetFallback";
import {
  isHistoryGuardState,
  pushHistoryGuard,
  restoreHistoryGuard,
  type HistoryGuardEntry,
} from "@/features/onboarding/history-guard";
import {
  CaptureDraftForm,
  type CaptureMode,
  type CaptureWorkflowState,
} from "./CaptureDraftForm";
import type { CaptureDiscardSheetProps } from "./CaptureDiscardSheet";
import type { CaptureMethodCoach } from "./VoiceCapturePanel";
import styles from "./Capture.module.css";

let captureDiscardSheetPromise: Promise<ComponentType<CaptureDiscardSheetProps>> | undefined;

function loadCaptureDiscardSheet(): Promise<ComponentType<CaptureDiscardSheetProps>> {
  captureDiscardSheetPromise ??= import("./CaptureDiscardSheet")
    .then((module) => module.CaptureDiscardSheet)
    .catch((error: unknown) => {
      console.error("Could not load the enhanced capture discard confirmation.", error);
      return CaptureDiscardSheetUnavailable;
    });
  return captureDiscardSheetPromise;
}

function CaptureDiscardSheetUnavailable({
  open,
  onStay,
  onDiscard,
  title = "Discard capture?",
  description = "Your recording, transcript, and unsaved drill changes will be lost.",
  stayLabel = "Keep editing",
  discardLabel = "Discard capture",
}: CaptureDiscardSheetProps) {
  if (!open) return null;

  return (
    <DiscardSheetFallback
      backdropClassName={styles.discardBackdrop}
      sheetClassName={styles.discardSheet}
      actionsClassName={styles.discardActions}
      title={title}
      description={description}
      statusMessage="Enhanced confirmation could not load. Standard confirmation remains available."
      stayLabel={stayLabel}
      discardLabel={discardLabel}
      onStay={onStay}
      onDiscard={onDiscard}
    />
  );
}

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
const captureGuardMarker = "__captureGuard";

export function CaptureDraftScreen({ initialMode, origin, onboarding }: CaptureDraftScreenProps) {
  const router = useRouter();
  const originRoute = origin === "network" ? "/" : "/?view=library";
  const activeView: AppView = origin;
  const [workflow, setWorkflow] = useState<CaptureWorkflowState>({
    mode: initialMode,
    phase: "input",
    hasUnsavedWork: false,
  });
  const [discardMounted, setDiscardMounted] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [DiscardSheetForOpen, setDiscardSheetForOpen] = useState<ComponentType<CaptureDiscardSheetProps> | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const [creationCommitting, setCreationCommitting] = useState(false);
  const [skipCommitting, setSkipCommitting] = useState(false);
  const dirtyRef = useRef(false);
  const creationCommittingRef = useRef(false);
  const skipCommittingRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const guardEntryRef = useRef<HistoryGuardEntry | null>(null);
  const atGuardEntryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);
  const navigationReleasedRef = useRef(false);
  const enhancedDiscardSheetRef = useRef<ComponentType<CaptureDiscardSheetProps> | null>(null);

  const openDiscardConfirmation = useCallback(() => {
    const discardSheetForOpen = enhancedDiscardSheetRef.current;
    setDiscardSheetForOpen(() => discardSheetForOpen);
    setDiscardMounted(true);
    setDiscardOpen(true);
    void loadCaptureDiscardSheet().then((DiscardSheet) => {
      enhancedDiscardSheetRef.current = DiscardSheet;
    });
  }, []);

  useEffect(() => {
    dirtyRef.current = workflow.hasUnsavedWork;
    creationCommittingRef.current = creationCommitting;
    skipCommittingRef.current = skipCommitting;
    const guarded = (
      workflow.hasUnsavedWork
      || creationCommitting
      || skipCommitting
    ) && !navigationReleasedRef.current;

    if (guarded && !guardKeyRef.current) {
      const guardKey = `capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      guardKeyRef.current = guardKey;
      guardEntryRef.current = pushHistoryGuard(captureGuardMarker, guardKey);
      atGuardEntryRef.current = true;
      return;
    }

    if (!guarded && guardKeyRef.current) {
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      guardEntryRef.current = null;
      if (
        atGuardEntryRef.current
        && isHistoryGuardState(window.history.state, captureGuardMarker, guardKey)
      ) {
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
      const guardEntry = guardEntryRef.current;
      const guardKey = guardKeyRef.current;
      if ((creationCommittingRef.current || skipCommittingRef.current) && guardEntry) {
        event.stopImmediatePropagation();
        if (isHistoryGuardState(event.state, captureGuardMarker, guardKey)) {
          atGuardEntryRef.current = true;
          return;
        }
        restoreHistoryGuard(guardEntry);
        atGuardEntryRef.current = true;
        return;
      }

      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        atGuardEntryRef.current = isHistoryGuardState(
          event.state,
          captureGuardMarker,
          guardKeyRef.current,
        );
        return;
      }

      if (!dirtyRef.current || !guardKey) return;
      if (isHistoryGuardState(event.state, captureGuardMarker, guardKey)) {
        atGuardEntryRef.current = true;
        return;
      }

      atGuardEntryRef.current = false;
      setPendingNavigation({ kind: "history" });
      openDiscardConfirmation();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState, { capture: true });
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState, { capture: true });
    };
  }, [openDiscardConfirmation]);

  const runWithoutPrompt = useCallback(
    (action: () => void) => {
      dirtyRef.current = false;
      navigationReleasedRef.current = true;
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      guardEntryRef.current = null;

      if (
        guardKey
        && atGuardEntryRef.current
        && isHistoryGuardState(window.history.state, captureGuardMarker, guardKey)
      ) {
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
      openDiscardConfirmation();
    },
    [navigateWithoutPrompt, openDiscardConfirmation],
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
      guardEntryRef.current = null;
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
    openDiscardConfirmation();
  }

  const skippingFirstDrill = pendingNavigation?.kind === "skip";
  const discardTitle = skippingFirstDrill ? "Skip your first drill?" : "Discard capture?";
  const discardDescription = skippingFirstDrill
    ? "You can reopen this guide later from Training Log. Any recording or unsaved drill will be discarded."
    : "Your recording, transcript, and unsaved drill changes will be lost.";
  const discardLabel = skippingFirstDrill ? "Skip for now" : "Discard capture";

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
      {discardMounted && (
        DiscardSheetForOpen ? (
          <DiscardSheetForOpen
            open={discardOpen}
            onStay={keepCapture}
            onDiscard={discardCapture}
            title={discardTitle}
            description={discardDescription}
            discardLabel={discardLabel}
          />
        ) : discardOpen ? (
          <DiscardSheetFallback
            backdropClassName={styles.discardBackdrop}
            sheetClassName={styles.discardSheet}
            actionsClassName={styles.discardActions}
            title={discardTitle}
            description={discardDescription}
            stayLabel="Keep editing"
            discardLabel={discardLabel}
            onStay={keepCapture}
            onDiscard={discardCapture}
          />
        ) : null
      )}
    </main>
  );
}
