import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { captureDraftRequestSchema, captureDraftResponseSchema } from "@/modules/capture/contracts";
import { generateCaptureDraft } from "@/modules/capture/draft";
import {
  CaptureDraftCancelledError,
  CaptureDraftConfigError,
  CaptureDraftGenerationError,
} from "@/modules/capture/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const input = captureDraftRequestSchema.parse(await request.json());
    const response = captureDraftResponseSchema.parse(
      await generateCaptureDraft(input.transcript, { signal: request.signal }),
    );
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error);
  }
}

function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid capture draft request or response shape.", issues: error.issues },
      { status: 400 },
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
