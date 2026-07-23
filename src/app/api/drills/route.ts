import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  createDrillInputSchema,
  drillDetailResponseSchema,
  drillListResponseSchema,
  parseDrillFiltersFromSearchParams,
} from "@/modules/drills/contracts";
import { CreateDrillValidationError, createDrill } from "@/modules/drills/mutations";
import { listDrills } from "@/modules/drills/queries";
import {
  authenticationErrorResponse,
  requireOnboardedUserId,
} from "@/modules/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Read-only drill list endpoint. Supports the same filter model the network
// and organized library need to share.
export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const filters = parseDrillFiltersFromSearchParams(request.nextUrl.searchParams);
    const drillList = drillListResponseSchema.parse(await listDrills(userId, filters));
    return NextResponse.json(drillList);
  } catch (error) {
    return handleRouteError(error, "Failed to load drills.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const input = createDrillInputSchema.parse(await request.json());
    const response = drillDetailResponseSchema.parse({ drill: await createDrill(userId, input) });
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create drill.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid drill request or response shape.", issues: error.issues }, { status: 400 });
  }

  if (error instanceof CreateDrillValidationError) {
    return NextResponse.json({ error: "Invalid drill relationships.", issues: error.issues }, { status: 400 });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
