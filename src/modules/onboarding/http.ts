import { NextResponse } from "next/server";
import { invalidateOnboardingState } from "@/modules/auth";

export function finalizeOnboardingMutationResponse({
  userId,
  attempted,
  succeeded,
  response,
  invalidationLogMessage,
  retryMessage,
}: {
  userId: string | null;
  attempted: boolean;
  succeeded: boolean;
  response: NextResponse;
  invalidationLogMessage: string;
  retryMessage: string;
}): NextResponse {
  if (!userId || !attempted) return response;

  try {
    invalidateOnboardingState(userId);
    return response;
  } catch (error) {
    console.error(invalidationLogMessage, error instanceof Error ? error.message : error);
    if (!succeeded || !response.ok) return response;
    return NextResponse.json(
      { error: retryMessage },
      { status: 503, headers: { "retry-after": "1" } },
    );
  }
}
