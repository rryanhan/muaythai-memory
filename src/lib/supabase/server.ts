import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Each Server Component or Route Handler gets a cookie-aware client. Cookie
// writes can be unavailable during Server Component rendering, so the proxy
// remains responsible for refreshing and persisting sessions.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getPublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const cookie of cookiesToSet) {
              cookieStore.set(cookie.name, cookie.value, cookie.options);
            }
          } catch {
            // Server Components cannot write cookies. proxy.ts refreshes them.
          }
        },
      },
    },
  );
}

function getPublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    requireServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
