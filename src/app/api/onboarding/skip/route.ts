import { NextResponse } from "next/server";
import { authenticationErrorResponse, isProfileOnboarded, requireCurrentAppUser } from "@/modules/auth";
import { onboardingSkipResponseSchema, skipFirstDrillGuide } from "@/modules/onboarding";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireCurrentAppUser();
    if (!isProfileOnboarded(user)) {
      return NextResponse.json({ error: "Complete your profile first." }, { status: 403 });
    }
    await skipFirstDrillGuide(user.id);
    return NextResponse.json(onboardingSkipResponseSchema.parse({ skipped: true }));
  } catch (error) {
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Onboarding skip failed.", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The guide could not be skipped. Try again." }, { status: 500 });
  }
}
