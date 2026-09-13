import { NextResponse } from "next/server";
import { requireProfileOnboardedUserId } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";
import { onboardingSkipResponseSchema } from "@/modules/onboarding/contracts";
import { finalizeOnboardingMutationResponse } from "@/modules/onboarding/http";
import { skipFirstDrillGuide } from "@/modules/onboarding/mutations";
import { parseResponseContract } from "@/modules/http/contracts";

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
    response = NextResponse.json(parseResponseContract(
      onboardingSkipResponseSchema,
      { skipped },
    ));
  } catch (error) {
    response = skipErrorResponse(error);
  }

  return finalizeOnboardingMutationResponse({
    userId: mutationUserId,
    attempted: mutationAttempted,
    succeeded: mutationSucceeded,
    response,
    invalidationLogMessage: "Onboarding state invalidation failed after first-drill skip.",
    retryMessage: "The guide was skipped, but onboarding could not be refreshed. Try again.",
  });
}

function skipErrorResponse(error: unknown): NextResponse {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;
  console.error("Onboarding skip failed.", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "The guide could not be skipped. Try again." }, { status: 500 });
}
