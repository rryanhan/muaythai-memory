import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { captureTranscriptionResponseSchema } from "@/modules/capture/contracts";
import {
  CaptureTranscriptionCancelledError,
  CaptureTranscriptionError,
} from "@/modules/capture/errors";
import { transcribeCaptureAudio } from "@/modules/capture/transcription";
import { authenticationErrorResponse, requireCurrentUserId } from "@/modules/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = randomUUID().slice(0, 8);
  const requestStartedAt = performance.now();
  try {
    await requireCurrentUserId();
    const parsingStartedAt = performance.now();
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      logTranscriptionTiming(requestId, "upload-rejected", requestStartedAt, {
        parseMs: elapsedMilliseconds(parsingStartedAt),
      });
      return NextResponse.json({ error: "Attach one audio recording." }, { status: 400 });
    }

    logTranscriptionTiming(requestId, "upload-parsed", requestStartedAt, {
      parseMs: elapsedMilliseconds(parsingStartedAt),
      mimeType: audio.type || "unknown",
      sizeBytes: audio.size,
    });

    const providerStartedAt = performance.now();
    const transcript = await transcribeCaptureAudio(audio, { signal: request.signal });
    logTranscriptionTiming(requestId, "provider-complete", requestStartedAt, {
      providerMs: elapsedMilliseconds(providerStartedAt),
      mimeType: audio.type || "unknown",
      sizeBytes: audio.size,
    });
    return NextResponse.json(captureTranscriptionResponseSchema.parse({ transcript }));
  } catch (error) {
    logTranscriptionTiming(requestId, "request-failed", requestStartedAt, {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof CaptureTranscriptionError) {
      return NextResponse.json(
        { error: error.message, ...(error.setup ? { setup: error.setup } : {}) },
        { status: error.status },
      );
    }
    if (error instanceof CaptureTranscriptionCancelledError) {
      return NextResponse.json({ error: error.message }, { status: 499 });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: "The audio upload could not be read." }, { status: 400 });
    }

    console.error("Failed to transcribe capture audio.", error);
    return NextResponse.json({ error: "Failed to transcribe the recording." }, { status: 500 });
  }
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function logTranscriptionTiming(
  requestId: string,
  stage: string,
  requestStartedAt: number,
  details: Record<string, string | number>,
) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[capture:transcribe]", {
    requestId,
    stage,
    totalMs: elapsedMilliseconds(requestStartedAt),
    ...details,
  });
}
