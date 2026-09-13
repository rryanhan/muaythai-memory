import { NextRequest, NextResponse } from "next/server";
import { graphResponseSchema, parseGraphRequestFromSearchParams } from "@/modules/graph/contracts";
import { getMuayThaiGraph } from "@/modules/graph/queries";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";
import {
  parseRequestContract,
  parseResponseContract,
  RequestContractError,
} from "@/modules/http/contracts";

export const dynamic = "force-dynamic";

// Graph endpoint returns render-ready nodes and edges, plus filter state echoes
// so the client can keep chips and graph state in sync.
export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const { filters, options } = parseRequestContract(
      () => parseGraphRequestFromSearchParams(request.nextUrl.searchParams),
    );
    const graph = parseResponseContract(
      graphResponseSchema,
      await getMuayThaiGraph(userId, filters, options),
    );
    return NextResponse.json(graph);
  } catch (error) {
    return handleRouteError(error, "Failed to load graph.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof RequestContractError) {
    return NextResponse.json(
      {
        error: "Invalid graph request.",
        ...(error.issues ? { issues: error.issues } : {}),
      },
      { status: 400 },
    );
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
