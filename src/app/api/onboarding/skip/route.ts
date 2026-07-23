import { NextResponse } from "next/server";
import {
  authenticationErrorResponse,
  invalidateOnboardingState,
  requireProfileOnboardedUserId,
} from "@/modules/auth";
import { onboardingSkipResponseSchema } from "@/modules/onboarding/contracts";
import { skipFirstDrillGuide } from "@/modules/onboarding/mutations";

export const runtime = "nodejs";

export async function POST() {
  let mutationUserId: string | null = null;
  let mutationAttempted = false;
  let mutationSucceeded = false;
  let response: NextResponse;

  try {
    const userId = await requireProfileOnboardedUserId();
    mutationUserId = userId;
    mutationAttempted = true;
    const skipped = await skipFirstDrillGuide(userId);
    mutationSucceeded = true;
    response = NextResponse.json(onboardingSkipResponseSchema.parse({ skipped }));
  } catch (error) {
    response = skipErrorResponse(error);
  }

  const invalidated = invalidateAfterMutation(mutationUserId, mutationAttempted);
  if (mutationSucceeded && response.ok && !invalidated) {
    return retryableInvalidationResponse(
      "The guide was skipped, but onboarding could not be refreshed. Try again.",
    );
  }
  return response;
}

function skipErrorResponse(error: unknown): NextResponse {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;
  console.error("Onboarding skip failed.", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "The guide could not be skipped. Try again." }, { status: 500 });
}

function invalidateAfterMutation(userId: string | null, attempted: boolean): boolean {
  if (!userId || !attempted) return true;
  try {
    invalidateOnboardingState(userId);
    return true;
  } catch (error) {
    console.error(
      "Onboarding state invalidation failed after first-drill skip.",
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
