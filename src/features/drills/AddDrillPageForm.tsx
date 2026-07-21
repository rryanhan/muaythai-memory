"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createOnboardingFirstDrill } from "@/data/onboarding";
import { CaptureDiscardSheet } from "@/features/capture/CaptureDiscardSheet";
import { useJournalUpload } from "@/features/journal/JournalUploadProvider";
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
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingExit, setPendingExit] = useState<"cancel" | "history" | null>(null);
  const dirtyRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const atGuardEntryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);

  useEffect(() => {
    if (!onboarding) return;

    dirtyRef.current = dirty;
    if (dirty && !guardKeyRef.current) {
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

    if (!dirty && guardKeyRef.current) {
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      if (atGuardEntryRef.current && window.history.state?.__manualDrillGuard === guardKey) {
        ignoreNextPopRef.current = true;
        atGuardEntryRef.current = false;
        window.history.back();
      }
    }
  }, [dirty, onboarding]);

  useEffect(() => {
    if (!onboarding) return;

    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
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
      runWithoutPrompt(() => {
        setDiscardOpen(false);
        setPendingExit(null);
        router.replace(returnRoute);
      });
    }

    function keepEditing() {
      if (pendingExit === "history" && !atGuardEntryRef.current) {
        ignoreNextPopRef.current = true;
        atGuardEntryRef.current = true;
        window.history.forward();
      }
      setDiscardOpen(false);
      setPendingExit(null);
    }

    function discardManualDrill() {
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

    return (
      <>
        <AddDrillForm
          createAction={createOnboardingFirstDrill}
          onDirtyChange={handleDirtyChange}
          onCancel={() => {
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
