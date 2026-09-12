import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { graphResponseSchema, parseGraphRequestFromSearchParams } from "@/modules/graph/contracts";
import { getMuayThaiGraph } from "@/modules/graph/queries";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";

export const dynamic = "force-dynamic";

// Graph endpoint returns render-ready nodes and edges, plus filter state echoes
// so the client can keep chips and graph state in sync.
export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const { filters, options } = parseGraphRequestFromSearchParams(request.nextUrl.searchParams);
    const graph = graphResponseSchema.parse(await getMuayThaiGraph(userId, filters, options));
    return NextResponse.json(graph);
  } catch (error) {
    return handleRouteError(error, "Failed to load graph.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid graph request or response shape.", issues: error.issues }, { status: 400 });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
