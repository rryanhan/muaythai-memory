import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase access is intentionally limited to Auth. Product data still
// travels through our typed Next API and Drizzle modules.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error("Supabase public Auth configuration is missing.");

  return createBrowserClient(url, key);
}
