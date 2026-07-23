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

  try {
    const userId = await requireProfileOnboardedUserId();
    mutationUserId = userId;
    mutationAttempted = true;
    const skipped = await skipFirstDrillGuide(userId);
    return NextResponse.json(onboardingSkipResponseSchema.parse({ skipped }));
  } catch (error) {
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Onboarding skip failed.", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The guide could not be skipped. Try again." }, { status: 500 });
  } finally {
    invalidateAfterMutation(mutationUserId, mutationAttempted);
  }
}

function invalidateAfterMutation(userId: string | null, attempted: boolean): void {
  if (!userId || !attempted) return;
  try {
    invalidateOnboardingState(userId);
  } catch (error) {
    console.error(
      "Onboarding state invalidation failed after first-drill skip.",
      error instanceof Error ? error.message : error,
    );
  }
}
