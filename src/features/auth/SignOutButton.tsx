"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SignOutButtonProps = {
  className?: string;
  errorClassName?: string;
};

export function SignOutButton({ className, errorClassName }: SignOutButtonProps) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setErrorMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setPending(false);
      setErrorMessage("Could not sign out. Check your connection and try again.");
      return;
    }

    queryClient.clear();
    window.location.assign("/auth/sign-in");
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
