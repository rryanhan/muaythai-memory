import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authenticationErrorResponse } from "@/modules/auth";
import { FriendMutationError } from "./errors";

export function friendErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid friends request.", issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof FriendMutationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  console.error(fallbackMessage, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
