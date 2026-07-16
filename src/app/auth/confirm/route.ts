import { NextRequest, NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Exchanges Supabase's short-lived PKCE code for a cookie-backed session before
 * protected-route handling sends the user to their original destination.
 */
export async function GET(request: NextRequest) {
  const nextPath = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");
  const requestOrigin = getRequestOrigin(request);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestOrigin));
    }
  }

  const signInUrl = new URL("/auth/sign-in", requestOrigin);
  signInUrl.searchParams.set("next", nextPath);
  signInUrl.searchParams.set("reason", "invalid-link");
  return NextResponse.redirect(signInUrl);
}

function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host) return request.nextUrl.origin;

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}
