import { NextRequest, NextResponse } from "next/server";
import {
  createDrillInputSchema,
  drillDetailResponseSchema,
  drillListResponseSchema,
  parseDrillFiltersFromSearchParams,
} from "@/modules/drills/contracts";
import { CreateDrillValidationError, createDrill } from "@/modules/drills/mutations";
import { listDrills } from "@/modules/drills/queries";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";
import {
  parseJsonRequest,
  parseRequestContract,
  parseResponseContract,
  RequestContractError,
} from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Read-only drill list endpoint. Supports the same filter model the network
// and organized library need to share.
export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const filters = parseRequestContract(
      () => parseDrillFiltersFromSearchParams(request.nextUrl.searchParams),
    );
    const drillList = parseResponseContract(
      drillListResponseSchema,
      await listDrills(userId, filters),
    );
    return NextResponse.json(drillList);
  } catch (error) {
    return handleRouteError(error, "Failed to load drills.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const input = await parseJsonRequest(request, createDrillInputSchema);
    const response = parseResponseContract(
      drillDetailResponseSchema,
      { drill: await createDrill(userId, input) },
    );
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create drill.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof RequestContractError) {
    return NextResponse.json(
      { error: "Invalid drill request.", ...(error.issues ? { issues: error.issues } : {}) },
      { status: 400 },
    );
  }

  if (error instanceof CreateDrillValidationError) {
    return NextResponse.json({ error: "Invalid drill relationships.", issues: error.issues }, { status: 400 });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
