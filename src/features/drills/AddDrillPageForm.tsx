"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createOnboardingFirstDrill } from "@/data/onboarding";
import { CaptureDiscardSheet } from "@/features/capture/CaptureDiscardSheet";
import { useJournalUpload } from "@/features/journal/JournalUploadProvider";
import { useFirstDrillCommit } from "@/features/onboarding/FirstDrillCommitContext";
import {
  isHistoryGuardState,
  pushHistoryGuard,
  restoreHistoryGuard,
  type HistoryGuardEntry,
} from "@/features/onboarding/history-guard";
import { AddDrillForm } from "./AddDrillForm";

const manualDrillGuardMarker = "__manualDrillGuard";

export function AddDrillPageForm({
  fromJournal,
  onboarding = false,
  nextPath = "/",
  replay = false,
}: {
  fromJournal: boolean;
  onboarding?: boolean;
  nextPath?: string;
  replay?: boolean;
}) {
  const router = useRouter();
  const journalUpload = useJournalUpload();
  const firstDrillCommit = useFirstDrillCommit();
  const [dirty, setDirty] = useState(false);
  const [creationCommitting, setCreationCommitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingExit, setPendingExit] = useState<"cancel" | "history" | null>(null);
  const dirtyRef = useRef(false);
  const creationCommittingRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const guardEntryRef = useRef<HistoryGuardEntry | null>(null);
  const atGuardEntryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);
  const navigationReleasedRef = useRef(false);

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
      setDiscardOpen(true);
    }

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", handlePopState, { capture: true });
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", handlePopState, { capture: true });
    };
  }, [onboarding]);

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
            setDiscardOpen(true);
          }}
          onSaveSuccess={(drillId) => {
            runWithoutPrompt(() => {
              router.replace(`/drills/${drillId}`);
              router.refresh();
            });
          }}
        />
        <CaptureDiscardSheet
          open={discardOpen}
          onStay={keepEditing}
          onDiscard={discardManualDrill}
          title="Discard this drill?"
          description="Your unsaved manual drill will be lost. You will return to the first-drill guide."
          stayLabel="Keep editing"
          discardLabel="Discard drill"
        />
      </>
    );
  }

  if (!fromJournal) return <AddDrillForm />;

  return (
    <AddDrillForm
      onCancel={() => router.replace("/journal/new")}
      onSaveSuccess={(drillId) => {
        journalUpload.setDrillId(drillId);
        router.replace("/journal/new");
        router.refresh();
      }}
    />
  );
}
