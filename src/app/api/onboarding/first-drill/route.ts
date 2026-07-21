import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authenticationErrorResponse, isProfileOnboarded, requireCurrentAppUser } from "@/modules/auth";
import { CreateDrillValidationError } from "@/modules/drills/mutations";
import {
  createGuidedFirstDrill,
  onboardingFirstDrillInputSchema,
  onboardingFirstDrillResponseSchema,
} from "@/modules/onboarding";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentAppUser();
    if (!isProfileOnboarded(user)) {
      return NextResponse.json({ error: "Complete your profile first." }, { status: 403 });
    }
    const input = onboardingFirstDrillInputSchema.parse(await request.json());
    const drill = await createGuidedFirstDrill(user.id, input);
    return NextResponse.json(onboardingFirstDrillResponseSchema.parse({ drill }));
  } catch (error) {
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof ZodError || error instanceof CreateDrillValidationError) {
      return NextResponse.json({ error: "Check the required drill fields and try again." }, { status: 400 });
    }
    console.error("First drill onboarding failed.", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Your first drill could not be saved. Try again." }, { status: 500 });
  }
}
