import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { taxonomyResponseSchema } from "@/modules/taxonomy/contracts";
import { getTaxonomy } from "@/modules/taxonomy/queries";

export const dynamic = "force-dynamic";

// Read-only taxonomy endpoint for filters, capture review, and graph controls.
export async function GET() {
  try {
    const taxonomy = taxonomyResponseSchema.parse(await getTaxonomy());
    return NextResponse.json(taxonomy);
  } catch (error) {
    return handleRouteError(error, "Failed to load taxonomy.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid taxonomy response shape.", issues: error.issues }, { status: 500 });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
