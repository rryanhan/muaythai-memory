import { NextResponse } from "next/server";
import { taxonomyResponseSchema } from "@/modules/taxonomy/contracts";
import { getTaxonomy } from "@/modules/taxonomy/queries";
import { requireCurrentUserId } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";
import { parseResponseContract } from "@/modules/http/contracts";

export const dynamic = "force-dynamic";

// Read-only taxonomy endpoint for filters, capture review, and graph controls.
export async function GET() {
  try {
    const userId = await requireCurrentUserId();
    const taxonomy = parseResponseContract(taxonomyResponseSchema, await getTaxonomy(userId));
    return NextResponse.json(taxonomy);
  } catch (error) {
    return handleRouteError(error, "Failed to load taxonomy.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
