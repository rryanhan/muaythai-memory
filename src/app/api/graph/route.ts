import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { graphResponseSchema, parseGraphRequestFromSearchParams } from "@/modules/graph/contracts";
import { getMuayThaiGraph } from "@/modules/graph/queries";

export const dynamic = "force-dynamic";

// Graph endpoint returns render-ready nodes and edges, plus filter state echoes
// so the client can keep chips and graph state in sync.
export async function GET(request: NextRequest) {
  try {
    const { filters, options } = parseGraphRequestFromSearchParams(request.nextUrl.searchParams);
    const graph = graphResponseSchema.parse(await getMuayThaiGraph(filters, options));
    return NextResponse.json(graph);
  } catch (error) {
    return handleRouteError(error, "Failed to load graph.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid graph request or response shape.", issues: error.issues }, { status: 400 });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
