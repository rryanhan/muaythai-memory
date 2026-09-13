"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { createOnboardingFirstDrill } from "@/data/onboarding";
import type { TaxonomyResponse } from "@/data/types";
import captureStyles from "@/features/capture/Capture.module.css";
import type { CaptureDiscardSheetProps } from "@/features/capture/CaptureDiscardSheet";
import { useJournalUpload } from "@/features/journal/JournalUploadProvider";
import { DiscardSheetFallback } from "@/features/media/DiscardSheetFallback";
import { useFirstDrillCommit } from "@/features/onboarding/FirstDrillCommitContext";
import {
  isHistoryGuardState,
  pushHistoryGuard,
  restoreHistoryGuard,
  type HistoryGuardEntry,
} from "@/features/onboarding/history-guard";
import { AddDrillForm } from "./AddDrillForm";

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
      backdropClassName={captureStyles.discardBackdrop}
      sheetClassName={captureStyles.discardSheet}
      actionsClassName={captureStyles.discardActions}
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

const manualDrillGuardMarker = "__manualDrillGuard";

export function AddDrillPageForm({
  fromJournal,
  onboarding = false,
  nextPath = "/",
  replay = false,
  initialTaxonomy,
}: {
  fromJournal: boolean;
  onboarding?: boolean;
  nextPath?: string;
  replay?: boolean;
  initialTaxonomy?: TaxonomyResponse;
}) {
  const router = useRouter();
  const journalUpload = useJournalUpload();
  const firstDrillCommit = useFirstDrillCommit();
  const [dirty, setDirty] = useState(false);
  const [creationCommitting, setCreationCommitting] = useState(false);
  const [discardMounted, setDiscardMounted] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [DiscardSheetForOpen, setDiscardSheetForOpen] = useState<ComponentType<CaptureDiscardSheetProps> | null>(null);
  const [pendingExit, setPendingExit] = useState<"cancel" | "history" | null>(null);
  const dirtyRef = useRef(false);
  const creationCommittingRef = useRef(false);
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
    if (!onboarding) return;

    dirtyRef.current = dirty;
    creationCommittingRef.current = creationCommitting;
    const guarded = (dirty || creationCommitting) && !navigationReleasedRef.current;
    if (guarded && !guardKeyRef.current) {
      const guardKey = `manual-drill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      guardKeyRef.current = guardKey;
      guardEntryRef.current = pushHistoryGuard(manualDrillGuardMarker, guardKey);
      atGuardEntryRef.current = true;
      return;
    }

    if (!guarded && guardKeyRef.current) {
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      guardEntryRef.current = null;
      if (
        atGuardEntryRef.current
        && isHistoryGuardState(window.history.state, manualDrillGuardMarker, guardKey)
      ) {
        ignoreNextPopRef.current = true;
        atGuardEntryRef.current = false;
        window.history.back();
      }
    }
  }, [creationCommitting, dirty, onboarding]);

  useEffect(() => {
    if (!onboarding) return;

    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current && !creationCommittingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handlePopState(event: PopStateEvent) {
      const guardEntry = guardEntryRef.current;
      const guardKey = guardKeyRef.current;
      if (creationCommittingRef.current && guardEntry) {
        event.stopImmediatePropagation();
        if (isHistoryGuardState(event.state, manualDrillGuardMarker, guardKey)) {
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
          manualDrillGuardMarker,
          guardKeyRef.current,
        );
        return;
      }

      if (!dirtyRef.current || !guardKey) return;
      if (isHistoryGuardState(event.state, manualDrillGuardMarker, guardKey)) {
        atGuardEntryRef.current = true;
        return;
      }

      atGuardEntryRef.current = false;
      setPendingExit("history");
      openDiscardConfirmation();
    }

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", handlePopState, { capture: true });
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", handlePopState, { capture: true });
    };
  }, [onboarding, openDiscardConfirmation]);

  const runWithoutPrompt = useCallback((action: () => void) => {
    dirtyRef.current = false;
    navigationReleasedRef.current = true;
    setDirty(false);
    const guardKey = guardKeyRef.current;
    guardKeyRef.current = null;
    guardEntryRef.current = null;

    if (
      guardKey
      && atGuardEntryRef.current
      && isHistoryGuardState(window.history.state, manualDrillGuardMarker, guardKey)
    ) {
      ignoreNextPopRef.current = true;
      window.addEventListener("popstate", action, { once: true });
      window.history.back();
      return;
    }

    action();
  }, []);

  if (onboarding) {
    const returnParams = new URLSearchParams({ next: nextPath });
    if (replay) returnParams.set("replay", "1");
    const returnRoute = `/onboarding/first-drill?${returnParams.toString()}`;

    function returnToGuide() {
      if (creationCommittingRef.current) return;
      runWithoutPrompt(() => {
        setDiscardOpen(false);
        setPendingExit(null);
        router.replace(returnRoute);
      });
    }

    function keepEditing() {
      if (creationCommittingRef.current) return;
      if (pendingExit === "history" && !atGuardEntryRef.current) {
        ignoreNextPopRef.current = true;
        atGuardEntryRef.current = true;
        window.history.forward();
      }
      setDiscardOpen(false);
      setPendingExit(null);
    }

    function discardManualDrill() {
      if (creationCommittingRef.current) return;
      if (pendingExit === "history") {
        dirtyRef.current = false;
        setDirty(false);
        guardKeyRef.current = null;
        guardEntryRef.current = null;
        setDiscardOpen(false);
        setPendingExit(null);
        ignoreNextPopRef.current = true;
        window.history.back();
        return;
      }
      returnToGuide();
    }

    function handleDirtyChange(nextDirty: boolean) {
      dirtyRef.current = nextDirty;
      setDirty(nextDirty);
    }

    function handleCreationCommitChange(committing: boolean) {
      creationCommittingRef.current = committing;
      setCreationCommitting(committing);
      firstDrillCommit.setCommitting(committing);
    }

    return (
      <>
        <AddDrillForm
          initialTaxonomy={initialTaxonomy}
          createAction={createOnboardingFirstDrill}
          onDirtyChange={handleDirtyChange}
          onCreationCommitChange={handleCreationCommitChange}
          onCancel={() => {
            if (creationCommittingRef.current) return;
            if (!dirtyRef.current) {
              returnToGuide();
              return;
            }
            setPendingExit("cancel");
            openDiscardConfirmation();
          }}
          onSaveSuccess={(drillId) => {
            runWithoutPrompt(() => {
              router.replace(`/drills/${drillId}`);
              router.refresh();
            });
          }}
        />
        {discardMounted && (
          DiscardSheetForOpen ? (
            <DiscardSheetForOpen
              open={discardOpen}
              onStay={keepEditing}
              onDiscard={discardManualDrill}
              title="Discard this drill?"
              description="Your unsaved manual drill will be lost. You will return to the first-drill guide."
              stayLabel="Keep editing"
              discardLabel="Discard drill"
            />
          ) : discardOpen ? (
            <DiscardSheetFallback
              backdropClassName={captureStyles.discardBackdrop}
              sheetClassName={captureStyles.discardSheet}
              actionsClassName={captureStyles.discardActions}
              title="Discard this drill?"
              description="Your unsaved manual drill will be lost. You will return to the first-drill guide."
              stayLabel="Keep editing"
              discardLabel="Discard drill"
              onStay={keepEditing}
              onDiscard={discardManualDrill}
            />
          ) : null
        )}
      </>
    );
  }

  if (!fromJournal) return <AddDrillForm initialTaxonomy={initialTaxonomy} />;

  return (
    <AddDrillForm
      initialTaxonomy={initialTaxonomy}
      onCancel={() => router.replace("/journal/new")}
      onSaveSuccess={(drillId) => {
        journalUpload.setDrillId(drillId);
        router.replace("/journal/new");
        router.refresh();
      }}
    />
  );
}
