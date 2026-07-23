"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createOnboardingFirstDrill } from "@/data/onboarding";
import { CaptureDiscardSheet } from "@/features/capture/CaptureDiscardSheet";
import { useJournalUpload } from "@/features/journal/JournalUploadProvider";
import { useFirstDrillCommit } from "@/features/onboarding/FirstDrillCommitContext";
import { AddDrillForm } from "./AddDrillForm";

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
  const atGuardEntryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);

  useEffect(() => {
    if (!onboarding) return;

    dirtyRef.current = dirty;
    creationCommittingRef.current = creationCommitting;
    const guarded = dirty || creationCommitting;
    if (guarded && !guardKeyRef.current) {
      const guardKey = `manual-drill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      guardKeyRef.current = guardKey;
      atGuardEntryRef.current = true;
      window.history.pushState(
        { ...window.history.state, __manualDrillGuard: guardKey },
        "",
        window.location.href,
      );
      return;
    }

    if (!guarded && guardKeyRef.current) {
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      if (atGuardEntryRef.current && window.history.state?.__manualDrillGuard === guardKey) {
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
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        atGuardEntryRef.current = event.state?.__manualDrillGuard === guardKeyRef.current;
        return;
      }

      const guardKey = guardKeyRef.current;
      if (creationCommittingRef.current) {
        if (event.state?.__manualDrillGuard === guardKey) {
          atGuardEntryRef.current = true;
          return;
        }
        atGuardEntryRef.current = false;
        ignoreNextPopRef.current = true;
        window.history.forward();
        return;
      }
      if (!dirtyRef.current || !guardKey) return;
      if (event.state?.__manualDrillGuard === guardKey) {
        atGuardEntryRef.current = true;
        return;
      }

      atGuardEntryRef.current = false;
      setPendingExit("history");
      setDiscardOpen(true);
    }

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [onboarding]);

  const runWithoutPrompt = useCallback((action: () => void) => {
    dirtyRef.current = false;
    setDirty(false);
    const guardKey = guardKeyRef.current;
    guardKeyRef.current = null;

    if (guardKey && atGuardEntryRef.current && window.history.state?.__manualDrillGuard === guardKey) {
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
