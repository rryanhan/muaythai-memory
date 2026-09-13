"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import { DiscardSheetFallback } from "@/features/media/DiscardSheetFallback";
import {
  isHistoryGuardState,
  restoreHistoryGuard,
  type HistoryGuardEntry,
} from "@/features/onboarding/history-guard";
import type { CurrentAppUser } from "@/modules/auth";
import type { ProfileDiscardSheetProps } from "./ProfileDiscardSheet";
import { ProfileEditForm } from "./ProfileEditForm";
import routeStyles from "./ProfileRouteShell.module.css";
import editStyles from "./ProfileEdit.module.css";

let profileDiscardSheetPromise: Promise<ComponentType<ProfileDiscardSheetProps>> | undefined;

function loadProfileDiscardSheet(): Promise<ComponentType<ProfileDiscardSheetProps>> {
  profileDiscardSheetPromise ??= import("./ProfileDiscardSheet")
    .then((module) => module.ProfileDiscardSheet)
    .catch((error: unknown) => {
      console.error("Could not load the enhanced profile discard confirmation.", error);
      return ProfileDiscardSheetUnavailable;
    });
  return profileDiscardSheetPromise;
}

function ProfileDiscardSheetUnavailable({
  open,
  onStay,
  onDiscard,
}: ProfileDiscardSheetProps) {
  if (!open) return null;

  return (
    <DiscardSheetFallback
      backdropClassName={editStyles.discardBackdrop}
      sheetClassName={editStyles.discardSheet}
      actionsClassName={editStyles.discardActions}
      title="Discard profile changes?"
      description="Your unsaved name and photo changes will be lost."
      statusMessage="Enhanced confirmation could not load. Standard confirmation remains available."
      stayLabel="Keep editing"
      discardLabel="Discard changes"
      onStay={onStay}
      onDiscard={onDiscard}
    />
  );
}

type PendingNavigation = { kind: "route"; destination: string } | { kind: "history" } | null;
const profileGuardMarker = "__profileGuard";

export function ProfileEditScreen({ currentUser }: { currentUser: CurrentAppUser }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [discardMounted, setDiscardMounted] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [DiscardSheetForOpen, setDiscardSheetForOpen] = useState<ComponentType<ProfileDiscardSheetProps> | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const dirtyRef = useRef(false);
  const savePendingRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const guardEntryRef = useRef<HistoryGuardEntry | null>(null);
  const baseEntryRef = useRef<HistoryGuardEntry | null>(null);
  const enhancedDiscardSheetRef = useRef<ComponentType<ProfileDiscardSheetProps> | null>(null);

  const openDiscardConfirmation = useCallback(() => {
    const discardSheetForOpen = enhancedDiscardSheetRef.current;
    setDiscardSheetForOpen(() => discardSheetForOpen);
    setDiscardMounted(true);
    setDiscardOpen(true);
    void loadProfileDiscardSheet().then((DiscardSheet) => {
      enhancedDiscardSheetRef.current = DiscardSheet;
    });
  }, []);

  const handleDirtyChange = useCallback((nextDirty: boolean) => {
    dirtyRef.current = nextDirty;
    setDirty(nextDirty);
  }, []);

  const handleSavePendingChange = useCallback((nextPending: boolean) => {
    savePendingRef.current = nextPending;
    setSavePending(nextPending);
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
      && isHistoryGuardState(window.history.state, profileGuardMarker, guardKey)
    ) {
      window.history.replaceState(baseEntry.state, "", baseEntry.url);
    }
    guardKeyRef.current = null;
    guardEntryRef.current = null;
    baseEntryRef.current = null;
    action();
  }, []);

  useEffect(() => {
    dirtyRef.current = dirty;
    savePendingRef.current = savePending;
    const navigationGuarded = dirty || savePending;
    if (navigationGuarded && !guardKeyRef.current) {
      const guardKey = `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const baseEntry: HistoryGuardEntry = {
        key: guardKey,
        state: { ...(window.history.state ?? {}) },
        url: window.location.href,
      };
      const guardEntry: HistoryGuardEntry = {
        key: guardKey,
        state: { ...baseEntry.state, [profileGuardMarker]: guardKey },
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
  }, [dirty, releaseHistoryGuard, savePending]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current && !savePendingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handlePopState(event: PopStateEvent) {
      const guardKey = guardKeyRef.current;
      const guardEntry = guardEntryRef.current;
      if ((!dirtyRef.current && !savePendingRef.current) || !guardKey || !guardEntry) return;

      event.stopImmediatePropagation();
      restoreHistoryGuard(guardEntry);
      if (savePendingRef.current) return;
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

  const navigateWithoutPrompt = useCallback((destination: string) => {
    if (savePendingRef.current) return;
    dirtyRef.current = false;
    setDirty(false);
    releaseHistoryGuard(() => {
      router.replace(destination);
      router.refresh();
    });
  }, [releaseHistoryGuard, router]);

  const requestNavigation = useCallback((destination: string) => {
    if (savePendingRef.current) return;
    if (!dirtyRef.current) {
      navigateWithoutPrompt(destination);
      return;
    }
    setPendingNavigation({ kind: "route", destination });
    openDiscardConfirmation();
  }, [navigateWithoutPrompt, openDiscardConfirmation]);

  function stay() {
    if (savePendingRef.current) return;
    setDiscardOpen(false);
    setPendingNavigation(null);
  }

  function discard() {
    if (savePendingRef.current) return;
    const navigation = pendingNavigation;
    setDiscardOpen(false);
    setPendingNavigation(null);
    if (navigation?.kind === "history") {
      dirtyRef.current = false;
      setDirty(false);
      releaseHistoryGuard(() => window.history.back());
      return;
    }
    navigateWithoutPrompt(navigation?.destination ?? "/?view=profile");
  }

  return (
    <main className={`${routeStyles.page} ${editStyles.page}`} aria-busy={savePending}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={routeStyles.header}>
        <button
          className={routeStyles.back}
          type="button"
          aria-label="Back to Profile"
          disabled={savePending}
          onClick={() => requestNavigation("/?view=profile")}
        >
          ←
        </button>
        <p className="eyebrow">Edit Profile</p>
      </header>
      <section className={routeStyles.heading}>
        <h1>Edit Profile</h1>
        <p>Update your username, private profile details, and photo.</p>
      </section>
      <ProfileEditForm
        initialProfile={currentUser}
        onDirtyChange={handleDirtyChange}
        onSavePendingChange={handleSavePendingChange}
        onCancel={() => requestNavigation("/?view=profile")}
        onSaved={() => navigateWithoutPrompt("/?view=profile")}
      />
      <RoutedBottomNav
        activeView="profile"
        disabled={savePending}
        onNavigate={(destination) => requestNavigation(destination)}
      />
      {discardMounted && (
        DiscardSheetForOpen ? (
          <DiscardSheetForOpen open={discardOpen} onStay={stay} onDiscard={discard} />
        ) : discardOpen ? (
          <DiscardSheetFallback
            backdropClassName={editStyles.discardBackdrop}
            sheetClassName={editStyles.discardSheet}
            actionsClassName={editStyles.discardActions}
            title="Discard profile changes?"
            description="Your unsaved name and photo changes will be lost."
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
