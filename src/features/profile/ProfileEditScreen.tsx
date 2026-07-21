"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RoutedBottomNav } from "@/components/navigation/RoutedBottomNav";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileDiscardSheet } from "./ProfileDiscardSheet";
import { ProfileEditForm } from "./ProfileEditForm";
import routeStyles from "./ProfileRouteShell.module.css";
import editStyles from "./ProfileEdit.module.css";

type PendingNavigation = { kind: "route"; destination: string } | { kind: "history" } | null;

export function ProfileEditScreen({ currentUser }: { currentUser: CurrentAppUser }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const dirtyRef = useRef(false);
  const guardKeyRef = useRef<string | null>(null);
  const atGuardEntryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (dirty && !guardKeyRef.current) {
      const guardKey = `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      guardKeyRef.current = guardKey;
      atGuardEntryRef.current = true;
      window.history.pushState({ ...window.history.state, __profileGuard: guardKey }, "", window.location.href);
      return;
    }

    if (!dirty && guardKeyRef.current) {
      const guardKey = guardKeyRef.current;
      guardKeyRef.current = null;
      if (atGuardEntryRef.current && window.history.state?.__profileGuard === guardKey) {
        ignoreNextPopRef.current = true;
        atGuardEntryRef.current = false;
        window.history.back();
      }
    }
  }, [dirty]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handlePopState(event: PopStateEvent) {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        atGuardEntryRef.current = event.state?.__profileGuard === guardKeyRef.current;
        return;
      }

      const guardKey = guardKeyRef.current;
      if (!dirtyRef.current || !guardKey) return;
      if (event.state?.__profileGuard === guardKey) {
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

  const navigateWithoutPrompt = useCallback((destination: string) => {
    dirtyRef.current = false;
    setDirty(false);
    const guardKey = guardKeyRef.current;
    guardKeyRef.current = null;

    if (guardKey && atGuardEntryRef.current && window.history.state?.__profileGuard === guardKey) {
      ignoreNextPopRef.current = true;
      window.addEventListener("popstate", () => {
        router.replace(destination);
        router.refresh();
      }, { once: true });
      window.history.back();
      return;
    }

    router.replace(destination);
    router.refresh();
  }, [router]);

  const requestNavigation = useCallback((destination: string) => {
    if (!dirtyRef.current) {
      navigateWithoutPrompt(destination);
      return;
    }
    setPendingNavigation({ kind: "route", destination });
    setDiscardOpen(true);
  }, [navigateWithoutPrompt]);

  function stay() {
    if (pendingNavigation?.kind === "history" && !atGuardEntryRef.current) {
      ignoreNextPopRef.current = true;
      atGuardEntryRef.current = true;
      window.history.forward();
    }
    setDiscardOpen(false);
    setPendingNavigation(null);
  }

  function discard() {
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
    navigateWithoutPrompt(navigation?.destination ?? "/?view=profile");
  }

  return (
    <main className={`${routeStyles.page} ${editStyles.page}`}>
      <div className="notebook-grid" aria-hidden="true" />
      <header className={routeStyles.header}>
        <button className={routeStyles.back} type="button" aria-label="Back to Profile" onClick={() => requestNavigation("/?view=profile")}>←</button>
        <p className="eyebrow">Edit Profile</p>
      </header>
      <section className={routeStyles.heading}>
        <h1>Edit Profile</h1>
        <p>Update your username, private profile details, and photo.</p>
      </section>
      <ProfileEditForm
        initialProfile={currentUser}
        onDirtyChange={setDirty}
        onCancel={() => requestNavigation("/?view=profile")}
        onSaved={() => navigateWithoutPrompt("/?view=profile")}
      />
      <RoutedBottomNav activeView="profile" onNavigate={(destination) => requestNavigation(destination)} />
      <ProfileDiscardSheet open={discardOpen} onStay={stay} onDiscard={discard} />
    </main>
  );
}
