import { NextResponse } from "next/server";
import { AuthenticationRequiredError, OnboardingRequiredError } from "./current-user";

export function authenticationErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AuthenticationRequiredError) && !(error instanceof OnboardingRequiredError)) return null;
  return NextResponse.json({ error: error.message }, { status: error.status });
}
