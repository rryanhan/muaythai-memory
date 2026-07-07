import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { drillListResponseSchema, parseDrillFiltersFromSearchParams } from "@/modules/drills/contracts";
import { listDrills } from "@/modules/drills/queries";

export const dynamic = "force-dynamic";

// Read-only drill list endpoint. Supports the same filter model the network
// and organized library need to share.
export async function GET(request: NextRequest) {
  try {
    const filters = parseDrillFiltersFromSearchParams(request.nextUrl.searchParams);
    const drillList = drillListResponseSchema.parse(await listDrills(filters));
    return NextResponse.json(drillList);
  } catch (error) {
    return handleRouteError(error, "Failed to load drills.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid drill request or response shape.", issues: error.issues }, { status: 400 });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
