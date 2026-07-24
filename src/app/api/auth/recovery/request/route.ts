import { NextRequest, NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setRecoveryIntentCookie } from "@/modules/auth/recovery-cookies";
import {
  getCanonicalAppOrigin,
  isSameOriginRequest,
} from "@/modules/auth/request-origin";
import {
  createRecoveryIntent,
  getAuthFlowSecret,
} from "@/modules/auth/recovery-token";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "The recovery request could not be accepted." }, { status: 403 });
  }

  const body = await readJsonBody(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const nextPath = safeInternalPath(typeof body?.next === "string" ? body.next : null);
  if (!email || email.length > 320) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { state, token } = createRecoveryIntent(email, { secret: getAuthFlowSecret() });
  const confirmationUrl = new URL("/auth/confirm", getCanonicalAppOrigin(request));
  confirmationUrl.searchParams.set("flow", "recovery");
  confirmationUrl.searchParams.set("state", state);
  confirmationUrl.searchParams.set("next", nextPath);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: confirmationUrl.toString(),
  });

  if (error) {
    const status = error.status === 429 ? 429 : 502;
    const message = status === 429
      ? "Too many attempts were made. Wait a while before trying again."
      : "The recovery email could not be sent. Try again shortly.";
    return NextResponse.json({ error: message }, { status });
  }

  const response = NextResponse.json({ sent: true });
  setRecoveryIntentCookie(response, token, request);
  return response;
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
