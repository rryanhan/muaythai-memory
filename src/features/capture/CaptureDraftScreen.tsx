"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import type { AppView } from "@/components/navigation/BottomNav";
import routeStyles from "@/features/drills/DrillRouteShell.module.css";
import { CaptureDiscardSheet } from "./CaptureDiscardSheet";
import {
  CaptureDraftForm,
  type CaptureMode,
  type CaptureWorkflowState,
} from "./CaptureDraftForm";

export type CaptureOrigin = "network" | "library";

type CaptureDraftScreenProps = {
  initialMode: CaptureMode;
  origin: CaptureOrigin;
};

type PendingNavigation =
  | { kind: "route"; destination: string }
  | { kind: "history" }
  | null;

const phaseCopy: Record<CaptureWorkflowState["phase"], string> = {
  input: "Record the messy version.",
  processing: "Turning your memo into a drill.",
  review: "Check the transcript and drill before saving.",
};

export function CaptureDraftScreen({ initialMode, origin }: CaptureDraftScreenProps) {
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
  const dirtyRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const atGuardEntryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = workflow.hasUnsavedWork;

    if (workflow.hasUnsavedWork && !guardKeyRef.current) {
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

    if (!workflow.hasUnsavedWork && guardKeyRef.current) {
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      if (atGuardEntryRef.current && window.history.state?.__captureGuard === guardKey) {
        ignoreNextPopRef.current = true;
        atGuardEntryRef.current = false;
        window.history.back();
      }
    }
  }, [workflow.hasUnsavedWork]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
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

  const navigateWithoutPrompt = useCallback(
    (destination: string) => {
      dirtyRef.current = false;
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;

      if (guardKey && atGuardEntryRef.current && window.history.state?.__captureGuard === guardKey) {
        ignoreNextPopRef.current = true;
        window.addEventListener(
          "popstate",
          () => {
            router.replace(destination);
          },
          { once: true },
        );
        window.history.back();
        return;
      }

      router.replace(destination);
    },
    [router],
  );

  const requestNavigation = useCallback(
    (destination: string) => {
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
    if (pendingNavigation?.kind === "history" && !atGuardEntryRef.current) {
      ignoreNextPopRef.current = true;
      atGuardEntryRef.current = true;
      window.history.forward();
    }
    setDiscardOpen(false);
    setPendingNavigation(null);
  }

  function discardCapture() {
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

    navigateWithoutPrompt(navigation?.destination ?? originRoute);
  }

  return (
    <main className={routeStyles.formPage}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <button
          type="button"
          className="drill-detail-page-back"
          aria-label="Exit Capture Drill"
          onClick={() => requestNavigation(originRoute)}
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
      />
      <RoutedBottomNav
        activeView={activeView}
        onNavigate={(destination) => requestNavigation(destination)}
      />
      <CaptureDiscardSheet open={discardOpen} onStay={keepCapture} onDiscard={discardCapture} />
    </main>
  );
}
