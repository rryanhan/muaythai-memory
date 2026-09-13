import { NextRequest, NextResponse } from "next/server";
import { requireCurrentAppUser } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";
import {
  completeProfileOnboarding,
  OnboardingValidationError,
} from "@/modules/onboarding/mutations";
import {
  onboardingProfileInputSchema,
  onboardingProfileResponseSchema,
} from "@/modules/onboarding/contracts";
import { finalizeOnboardingMutationResponse } from "@/modules/onboarding/http";
import {
  parseJsonRequest,
  parseResponseContract,
  RequestContractError,
} from "@/modules/http/contracts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let mutationUserId: string | null = null;
  let mutationAttempted = false;
  let mutationSucceeded = false;
  let response: NextResponse;

  try {
    const user = await requireCurrentAppUser();
    const input = await parseJsonRequest(request, onboardingProfileInputSchema);
    mutationUserId = user.id;
    mutationAttempted = true;
    const username = await completeProfileOnboarding(user, {
      username: input.username,
      firstName: input.firstName ?? "",
      lastName: input.lastName ?? "",
      location: input.location ?? "",
    });
    mutationSucceeded = true;
    response = NextResponse.json(parseResponseContract(
      onboardingProfileResponseSchema,
      { username, next: "first-drill" },
    ));
  } catch (error) {
    response = profileErrorResponse(error);
  }

  return finalizeOnboardingMutationResponse({
    userId: mutationUserId,
    attempted: mutationAttempted,
    succeeded: mutationSucceeded,
    response,
    invalidationLogMessage: "Onboarding state invalidation failed after profile.",
    retryMessage: "Your profile was saved, but onboarding could not be refreshed. Try again.",
  });
}

function profileErrorResponse(error: unknown): NextResponse {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;
  if (error instanceof OnboardingValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof RequestContractError) {
    return NextResponse.json(
      { error: error.issues?.[0]?.message ?? "Enter valid profile details." },
      { status: 400 },
    );
  }
  console.error("Profile onboarding failed.", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Profile could not be saved. Try again." }, { status: 500 });
}
