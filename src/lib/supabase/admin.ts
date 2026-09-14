import { createClient } from "@supabase/supabase-js";

type SupabaseAdminClientOptions = {
  fetch?: typeof globalThis.fetch;
};

// Service-role clients are server-only. Keep this helper out of client imports;
// it bypasses Storage RLS for trusted profile and setup operations.
export function createSupabaseAdminClient({
  fetch,
}: SupabaseAdminClientOptions = {}) {
  return createClient(requireAdminEnv("NEXT_PUBLIC_SUPABASE_URL"), requireAdminEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...(fetch ? { global: { fetch } } : {}),
  });
}

function requireAdminEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
