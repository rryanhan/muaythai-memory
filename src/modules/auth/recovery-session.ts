import type { SupabaseClient } from "@supabase/supabase-js";

export type RecoverySessionIdentity = {
  userId: string;
  email: string;
  sessionId: string;
};

export async function getRecoverySessionIdentity(
  supabase: SupabaseClient,
): Promise<RecoverySessionIdentity | null> {
  const [
    { data: userData, error: userError },
    { data: claimsData, error: claimsError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getClaims(),
  ]);
  const user = userData.user;
  const sessionId = claimsData?.claims?.session_id;

  if (
    userError ||
    claimsError ||
    !user?.id ||
    !user.email ||
    typeof sessionId !== "string" ||
    !sessionId
  ) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    sessionId,
  };
}
