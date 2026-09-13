"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useJournalUpload } from "@/features/journal/JournalUploadProvider";

type SupabaseBrowserClientModule = typeof import("@/lib/supabase/client");

let supabaseBrowserClientModulePromise: Promise<SupabaseBrowserClientModule> | null = null;

type SignOutButtonProps = {
  className?: string;
  errorClassName?: string;
};

export function SignOutButton({ className, errorClassName }: SignOutButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const journalUpload = useJournalUpload();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signOut() {
    if (journalUpload.hasWork) {
      const confirmed = window.confirm("Discard the active journal upload and sign out?");
      if (!confirmed) return;
    }
    setPending(true);
    setErrorMessage(null);
    if (journalUpload.hasWork) {
      try {
        await journalUpload.discardWork();
      } catch {
        setPending(false);
        setErrorMessage("Could not discard the active journal upload. Try again.");
        return;
      }
    }
    try {
      const { createSupabaseBrowserClient } = await loadSupabaseBrowserClientModule();
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch {
      setPending(false);
      setErrorMessage("Could not sign out. Check your connection and try again.");
      return;
    }

    queryClient.clear();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <>
      <button className={className} type="button" disabled={pending} onClick={() => void signOut()}>
        {pending ? "Signing out..." : "Sign out"}
      </button>
      {errorMessage && (
        <p className={errorClassName} role="alert">
          {errorMessage}
        </p>
      )}
    </>
  );
}

function loadSupabaseBrowserClientModule(): Promise<SupabaseBrowserClientModule> {
  if (!supabaseBrowserClientModulePromise) {
    supabaseBrowserClientModulePromise = import("@/lib/supabase/client").catch((error) => {
      supabaseBrowserClientModulePromise = null;
      throw error;
    });
  }

  return supabaseBrowserClientModulePromise;
}
