import { NextRequest, NextResponse } from "next/server";
import {
  authenticationErrorResponse,
  invalidateOnboardingState,
  requireCurrentAppUser,
} from "@/modules/auth";
import {
  completeProfileOnboarding,
  OnboardingValidationError,
} from "@/modules/onboarding/mutations";
import { onboardingProfileResponseSchema } from "@/modules/onboarding/contracts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let mutationUserId: string | null = null;
  let mutationAttempted = false;

  try {
    const user = await requireCurrentAppUser();
    const input = await request.json();
    mutationUserId = user.id;
    mutationAttempted = true;
    const username = await completeProfileOnboarding(user, input);
    return NextResponse.json(onboardingProfileResponseSchema.parse({ username, next: "first-drill" }));
  } catch (error) {
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof OnboardingValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Enter valid profile details." }, { status: 400 });
    }
    console.error("Profile onboarding failed.", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Profile could not be saved. Try again." }, { status: 500 });
  } finally {
    invalidateAfterMutation(mutationUserId, mutationAttempted, "profile");
  }
}

function invalidateAfterMutation(userId: string | null, attempted: boolean, mutation: string): void {
  if (!userId || !attempted) return;
  try {
    invalidateOnboardingState(userId);
  } catch (error) {
    console.error(
      `Onboarding state invalidation failed after ${mutation}.`,
      error instanceof Error ? error.message : error,
    );
  }
}
