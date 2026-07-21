import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/safe-internal-path";

const PUBLIC_PAGE_PATHS = new Set(["/auth/sign-in", "/auth/confirm", "/auth/forgot-password"]);

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    requireProxyEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getPublishableKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            request.cookies.set(cookie.name, cookie.value);
          }

          response = NextResponse.next({ request });
          for (const cookie of cookiesToSet) {
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = !error && Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;

  if (!isAuthenticated && !isPublicRequest(pathname)) {
    if (pathname.startsWith("/api/")) return response;

    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/auth/sign-in";
    signInUrl.search = "";
    signInUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }

  if (isAuthenticated && pathname === "/auth/sign-in") {
    const requestedNext = request.nextUrl.searchParams.get("next");
    return NextResponse.redirect(new URL(safeInternalPath(requestedNext), request.url));
  }

  return response;
}

function isPublicRequest(pathname: string): boolean {
  return PUBLIC_PAGE_PATHS.has(pathname) || pathname.startsWith("/_next/") || pathname === "/favicon.ico";
}

function getPublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    requireProxyEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

function requireProxyEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
