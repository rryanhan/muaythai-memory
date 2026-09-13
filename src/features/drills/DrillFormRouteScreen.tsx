"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import type { DrillDetail, TaxonomyResponse } from "@/data/types";
import captureStyles from "@/features/capture/Capture.module.css";
import type { CaptureDiscardSheetProps } from "@/features/capture/CaptureDiscardSheet";
import { useJournalUpload } from "@/features/journal/JournalUploadProvider";
import { DiscardSheetFallback } from "@/features/media/DiscardSheetFallback";
import {
  isHistoryGuardState,
  restoreHistoryGuard,
  type HistoryGuardEntry,
} from "@/features/onboarding/history-guard";
import { AddDrillForm } from "./AddDrillForm";
import { DeleteDrillSection } from "./DeleteDrillSection";
import routeStyles from "./DrillRouteShell.module.css";

type DrillFormRouteScreenProps =
  | {
    variant: "create";
    fromJournal: boolean;
    initialTaxonomy?: TaxonomyResponse;
  }
  | {
    variant: "edit";
    drill: DrillDetail;
    initialTaxonomy?: TaxonomyResponse;
  };

type PendingNavigation = { kind: "route"; destination: string } | { kind: "history" } | null;

const drillFormGuardMarker = "__drillFormGuard";
let captureDiscardSheetPromise: Promise<ComponentType<CaptureDiscardSheetProps>> | undefined;

function loadCaptureDiscardSheet(): Promise<ComponentType<CaptureDiscardSheetProps>> {
  captureDiscardSheetPromise ??= import("@/features/capture/CaptureDiscardSheet")
    .then((module) => module.CaptureDiscardSheet)
    .catch((error: unknown) => {
      console.error("Could not load the enhanced drill discard confirmation.", error);
      return CaptureDiscardSheetUnavailable;
    });
  return captureDiscardSheetPromise;
}

function CaptureDiscardSheetUnavailable(props: CaptureDiscardSheetProps) {
  if (!props.open) return null;

  return (
    <DiscardSheetFallback
      backdropClassName={captureStyles.discardBackdrop}
      sheetClassName={captureStyles.discardSheet}
      actionsClassName={captureStyles.discardActions}
      title={props.title ?? "Discard drill changes?"}
      description={props.description ?? "Your unsaved drill changes will be lost."}
      statusMessage="Enhanced confirmation could not load. Standard confirmation remains available."
      stayLabel={props.stayLabel ?? "Keep editing"}
      discardLabel={props.discardLabel ?? "Discard changes"}
      onStay={props.onStay}
      onDiscard={props.onDiscard}
    />
  );
}

export function DrillFormRouteScreen(props: DrillFormRouteScreenProps) {
  const router = useRouter();
  const journalUpload = useJournalUpload();
  const editing = props.variant === "edit";
  const fromJournal = props.variant === "create" && props.fromJournal;
  const drill = editing ? props.drill : undefined;
  const fallbackDestination = editing
    ? `/drills/${props.drill.id}`
    : fromJournal
      ? "/journal/new"
      : "/?view=library";
  const [dirty, setDirty] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [navigationReleased, setNavigationReleased] = useState(false);
  const [discardMounted, setDiscardMounted] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [DiscardSheetForOpen, setDiscardSheetForOpen] =
    useState<ComponentType<CaptureDiscardSheetProps> | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const dirtyRef = useRef(false);
  const savePendingRef = useRef(false);
  const deletePendingRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const guardEntryRef = useRef<HistoryGuardEntry | null>(null);
  const baseEntryRef = useRef<HistoryGuardEntry | null>(null);
  const navigationReleasedRef = useRef(false);
  const enhancedDiscardSheetRef = useRef<ComponentType<CaptureDiscardSheetProps> | null>(null);
  const mutationPending = savePending || deletePending || navigationReleased;

  const openDiscardConfirmation = useCallback(() => {
    const discardSheetForOpen = enhancedDiscardSheetRef.current;
    setDiscardSheetForOpen(() => discardSheetForOpen);
    setDiscardMounted(true);
    setDiscardOpen(true);
    void loadCaptureDiscardSheet().then((DiscardSheet) => {
      enhancedDiscardSheetRef.current = DiscardSheet;
    });
  }, []);

  const handleDirtyChange = useCallback((nextDirty: boolean) => {
    if (navigationReleasedRef.current) return;
    dirtyRef.current = nextDirty;
    setDirty(nextDirty);
  }, []);

  const handleSavePendingChange = useCallback((nextPending: boolean) => {
    if (navigationReleasedRef.current) return;
    savePendingRef.current = nextPending;
    setSavePending(nextPending);
    if (nextPending) {
      setDiscardOpen(false);
      setPendingNavigation(null);
    }
  }, []);

  const handleDeletePendingChange = useCallback((nextPending: boolean) => {
    if (navigationReleasedRef.current) return;
    deletePendingRef.current = nextPending;
    setDeletePending(nextPending);
    if (nextPending) {
      setDiscardOpen(false);
      setPendingNavigation(null);
    }
  }, []);

  const releaseHistoryGuard = useCallback((action: () => void) => {
    const guardKey = guardKeyRef.current;
    const baseEntry = baseEntryRef.current;
    if (
      guardKey
      && baseEntry
      && isHistoryGuardState(window.history.state, drillFormGuardMarker, guardKey)
    ) {
      window.history.replaceState(baseEntry.state, "", baseEntry.url);
    }
    guardKeyRef.current = null;
    guardEntryRef.current = null;
    baseEntryRef.current = null;
    action();
  }, []);

  const clearGuardedState = useCallback(() => {
    navigationReleasedRef.current = true;
    setNavigationReleased(true);
    dirtyRef.current = false;
    savePendingRef.current = false;
    deletePendingRef.current = false;
    setDirty(false);
    setSavePending(false);
    setDeletePending(false);
    setDiscardOpen(false);
    setPendingNavigation(null);
  }, []);

  const replaceRoute = useCallback((destination: string) => {
    releaseHistoryGuard(() => {
      router.replace(destination);
      router.refresh();
    });
  }, [releaseHistoryGuard, router]);

  const navigateWithoutPrompt = useCallback((destination: string) => {
    if (navigationReleasedRef.current || savePendingRef.current || deletePendingRef.current) return;
    clearGuardedState();
    replaceRoute(destination);
  }, [clearGuardedState, replaceRoute]);

  const finishMutation = useCallback((destination: string, beforeNavigate?: () => void) => {
    if (navigationReleasedRef.current) return;
    navigationReleasedRef.current = true;
    setNavigationReleased(true);
    dirtyRef.current = false;
    savePendingRef.current = false;
    deletePendingRef.current = false;
    setDirty(false);
    setDiscardOpen(false);
    setPendingNavigation(null);
    releaseHistoryGuard(() => {
      beforeNavigate?.();
      router.replace(destination);
      router.refresh();
    });
  }, [releaseHistoryGuard, router]);

  const goBackOrFallback = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    router.replace(fallbackDestination);
    router.refresh();
  }, [fallbackDestination, router]);

  const requestRouteNavigation = useCallback((destination: string) => {
    if (navigationReleasedRef.current || savePendingRef.current || deletePendingRef.current) return;
    if (!dirtyRef.current) {
      navigateWithoutPrompt(destination);
      return;
    }
    setPendingNavigation({ kind: "route", destination });
    openDiscardConfirmation();
  }, [navigateWithoutPrompt, openDiscardConfirmation]);

  const requestBackNavigation = useCallback(() => {
    if (navigationReleasedRef.current || savePendingRef.current || deletePendingRef.current) return;
    if (!dirtyRef.current) {
      clearGuardedState();
      releaseHistoryGuard(goBackOrFallback);
      return;
    }
    setPendingNavigation({ kind: "history" });
    openDiscardConfirmation();
  }, [clearGuardedState, goBackOrFallback, openDiscardConfirmation, releaseHistoryGuard]);

  useEffect(() => {
    const navigationGuarded = (dirty || savePending || deletePending) && !navigationReleased;
    if (navigationGuarded && !guardKeyRef.current) {
      const guardKey = `drill-form-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const baseEntry: HistoryGuardEntry = {
        key: guardKey,
        state: { ...(window.history.state ?? {}) },
        url: window.location.href,
      };
      const guardEntry: HistoryGuardEntry = {
        key: guardKey,
        state: { ...baseEntry.state, [drillFormGuardMarker]: guardKey },
        url: baseEntry.url,
      };
      guardKeyRef.current = guardKey;
      baseEntryRef.current = baseEntry;
      guardEntryRef.current = guardEntry;
      window.history.replaceState(guardEntry.state, "", guardEntry.url);
      return;
    }

    if (!navigationGuarded && guardKeyRef.current) {
      releaseHistoryGuard(() => {});
    }
  }, [deletePending, dirty, navigationReleased, releaseHistoryGuard, savePending]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current && !savePendingRef.current && !deletePendingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handlePopState(event: PopStateEvent) {
      const guardKey = guardKeyRef.current;
      const guardEntry = guardEntryRef.current;
      if (
        (!dirtyRef.current && !savePendingRef.current && !deletePendingRef.current)
        || !guardKey
        || !guardEntry
      ) return;

      event.stopImmediatePropagation();
      // Pushing the form from the attempted entry leaves that exact entry
      // immediately behind it for both Back and Forward, including Next state.
      restoreHistoryGuard(guardEntry);
      if (savePendingRef.current || deletePendingRef.current) return;
      setPendingNavigation({ kind: "history" });
      openDiscardConfirmation();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState, { capture: true });
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState, { capture: true });
      const guardKey = guardKeyRef.current;
      const baseEntry = baseEntryRef.current;
      if (
        guardKey
        && baseEntry
        && isHistoryGuardState(window.history.state, drillFormGuardMarker, guardKey)
      ) {
        window.history.replaceState(baseEntry.state, "", baseEntry.url);
      }
    };
  }, [openDiscardConfirmation]);

  function stay() {
    if (navigationReleasedRef.current || savePendingRef.current || deletePendingRef.current) return;
    setDiscardOpen(false);
    setPendingNavigation(null);
  }

  function discard() {
    if (navigationReleasedRef.current || savePendingRef.current || deletePendingRef.current) return;
    const navigation = pendingNavigation;
    clearGuardedState();
    if (navigation?.kind === "history") {
      releaseHistoryGuard(goBackOrFallback);
      return;
    }
    replaceRoute(navigation?.destination ?? fallbackDestination);
  }

  function handleSaveSuccess(drillId: string) {
    if (fromJournal) {
      finishMutation("/journal/new", () => journalUpload.setDrillId(drillId));
      return;
    }
    finishMutation(`/drills/${drillId}`);
  }

  const discardTitle = editing ? "Discard drill changes?" : "Discard this drill?";
  const discardDescription = editing
    ? "Your unsaved changes to this drill will be lost."
    : fromJournal
      ? "Your unsaved drill will be lost. You will return to your journal entry."
      : "Your unsaved drill will be lost.";

  return (
    <main className={routeStyles.formPage} aria-busy={mutationPending}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className="drill-detail-page-header">
        <button
          type="button"
          className="drill-detail-page-back"
          aria-label={editing ? "Back to drill" : fromJournal ? "Back to journal entry" : "Back"}
          disabled={mutationPending}
          onClick={requestBackNavigation}
        >
          <span aria-hidden="true">←</span>
        </button>
        <p className="eyebrow">{editing ? "Edit Drill" : "Add Drill"}</p>
      </header>
      <section className="add-drill-heading">
        <h1>{editing ? "Edit Drill" : fromJournal ? "New Related Drill" : "New Drill"}</h1>
        <p>
          {editing
            ? "Adjust the steps, notes, tags, and saved-list markers."
            : fromJournal
              ? "Create the drill, then return to your journal entry."
              : "Save the steps, notes, and tags while it is still fresh."}
        </p>
      </section>
      <AddDrillForm
        mode={editing ? "edit" : "create"}
        initialDrill={drill}
        initialTaxonomy={props.initialTaxonomy}
        disabled={deletePending || navigationReleased}
        onDirtyChange={handleDirtyChange}
        onCreationCommitChange={handleSavePendingChange}
        onCancel={fromJournal
          ? () => requestRouteNavigation(fallbackDestination)
          : requestBackNavigation}
        onSaveSuccess={handleSaveSuccess}
      />
      {drill && (
        <DeleteDrillSection
          drillId={drill.id}
          drillTitle={drill.title}
          disabled={savePending || navigationReleased}
          onPendingChange={handleDeletePendingChange}
          onDeleted={() => finishMutation("/?view=library")}
        />
      )}
      <RoutedBottomNav
        activeView={fromJournal ? "profile" : "library"}
        disabled={mutationPending}
        onNavigate={(destination) => requestRouteNavigation(destination)}
      />
      {discardMounted && (
        DiscardSheetForOpen ? (
          <DiscardSheetForOpen
            open={discardOpen}
            onStay={stay}
            onDiscard={discard}
            title={discardTitle}
            description={discardDescription}
            stayLabel="Keep editing"
            discardLabel="Discard changes"
            ariaLabel="Discard drill confirmation"
          />
        ) : discardOpen ? (
          <DiscardSheetFallback
            backdropClassName={captureStyles.discardBackdrop}
            sheetClassName={captureStyles.discardSheet}
            actionsClassName={captureStyles.discardActions}
            title={discardTitle}
            description={discardDescription}
            stayLabel="Keep editing"
            discardLabel="Discard changes"
            onStay={stay}
            onDiscard={discard}
          />
        ) : null
      )}
    </main>
  );
}
