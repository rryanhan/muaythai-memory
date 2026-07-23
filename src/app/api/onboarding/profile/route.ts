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
  try {
    const user = await requireCurrentAppUser();
    const input = await request.json();
    const username = await completeProfileOnboarding(user, input);
    invalidateOnboardingState(user.id);
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
  }
}
