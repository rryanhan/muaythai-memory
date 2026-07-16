import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "./current-user";

export function authenticationErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AuthenticationRequiredError)) return null;
  return NextResponse.json({ error: error.message }, { status: error.status });
}
