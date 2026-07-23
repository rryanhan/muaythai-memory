import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  authenticationErrorResponse,
  invalidateOnboardingState,
  requireProfileOnboardedUserId,
} from "@/modules/auth";
import {
  CreateDrillIdempotencyError,
  CreateDrillValidationError,
} from "@/modules/drills/mutations";
import { createGuidedFirstDrill } from "@/modules/onboarding/mutations";
import {
  onboardingCreationKeySchema,
  onboardingFirstDrillInputSchema,
  onboardingFirstDrillResponseSchema,
} from "@/modules/onboarding/contracts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let mutationUserId: string | null = null;
  let mutationAttempted = false;
  let mutationSucceeded = false;
  let response: NextResponse;

  try {
    const userId = await requireProfileOnboardedUserId();
    const creationKey = onboardingCreationKeySchema.parse(request.headers.get("idempotency-key"));
    const input = onboardingFirstDrillInputSchema.parse(await request.json());
    mutationUserId = userId;
    mutationAttempted = true;
    const drill = await createGuidedFirstDrill(userId, input, creationKey);
    mutationSucceeded = true;
    response = NextResponse.json(onboardingFirstDrillResponseSchema.parse({ drill }));
  } catch (error) {
    response = firstDrillErrorResponse(error);
  }

  const invalidated = invalidateAfterMutation(mutationUserId, mutationAttempted);
  if (mutationSucceeded && response.ok && !invalidated) {
    return retryableInvalidationResponse(
      "Your first drill was saved, but onboarding could not be refreshed. Try again.",
    );
  }
  return response;
}

function firstDrillErrorResponse(error: unknown): NextResponse {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;
  if (error instanceof ZodError || error instanceof CreateDrillValidationError) {
    return NextResponse.json({ error: "Check the required drill fields and try again." }, { status: 400 });
  }
  if (error instanceof CreateDrillIdempotencyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("First drill onboarding failed.", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Your first drill could not be saved. Try again." }, { status: 500 });
}

function invalidateAfterMutation(userId: string | null, attempted: boolean): boolean {
  if (!userId || !attempted) return true;
  try {
    invalidateOnboardingState(userId);
    return true;
  } catch (error) {
    console.error(
      "Onboarding state invalidation failed after first-drill save.",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

function retryableInvalidationResponse(message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 503, headers: { "retry-after": "1" } },
  );
}
