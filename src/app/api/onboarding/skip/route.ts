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
  try {
    const userId = await requireProfileOnboardedUserId();
    const skipped = await skipFirstDrillGuide(userId);
    invalidateOnboardingState(userId);
    return NextResponse.json(onboardingSkipResponseSchema.parse({ skipped }));
  } catch (error) {
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Onboarding skip failed.", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The guide could not be skipped. Try again." }, { status: 500 });
  }
}
