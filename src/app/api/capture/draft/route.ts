import { NextRequest, NextResponse } from "next/server";
import { captureDraftRequestSchema, captureDraftResponseSchema } from "@/modules/capture/contracts";
import { generateCaptureDraft } from "@/modules/capture/draft";
import {
  CaptureDraftCancelledError,
  CaptureDraftConfigError,
  CaptureDraftGenerationError,
} from "@/modules/capture/errors";
import { CaptureRateLimitError } from "@/modules/capture/rate-limits";
import { requireProfileOnboardedUserId } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";
import {
  parseJsonRequest,
  parseResponseContract,
  RequestContractError,
} from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireProfileOnboardedUserId();
    const input = await parseJsonRequest(request, captureDraftRequestSchema);
    const response = parseResponseContract(
      captureDraftResponseSchema,
      await generateCaptureDraft(userId, input.transcript, { signal: request.signal }),
    );
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error);
  }
}

function handleRouteError(error: unknown) {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof RequestContractError) {
    return NextResponse.json(
      {
        error: "Invalid capture draft request.",
        ...(error.issues ? { issues: error.issues } : {}),
      },
      { status: 400 },
    );
  }

  if (error instanceof CaptureRateLimitError) {
    return NextResponse.json(
      { error: error.message, retryAfterSeconds: error.retryAfterSeconds },
      {
        status: error.status,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      },
    );
  }

  if (error instanceof CaptureDraftConfigError) {
    return NextResponse.json(
      {
        error: error.message,
        setup: error.setup,
      },
      { status: 500 },
    );
  }

  if (error instanceof CaptureDraftGenerationError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  if (error instanceof CaptureDraftCancelledError) {
    return NextResponse.json({ error: error.message }, { status: 499 });
  }

  console.error("Failed to generate capture draft.", error);
  return NextResponse.json({ error: "Failed to generate capture draft." }, { status: 500 });
}
