import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteDrillResponseSchema,
  drillDetailResponseSchema,
  updateDrillInputSchema,
} from "@/modules/drills/contracts";
import {
  DeleteDrillValidationError,
  deleteDrill,
  UpdateDrillValidationError,
  updateDrill,
} from "@/modules/drills/mutations";
import { getDrillById } from "@/modules/drills/queries";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";
import {
  parseJsonRequest,
  parseRequestValue,
  parseResponseContract,
  RequestContractError,
} from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const routeParamsSchema = z.object({
  id: z.string().uuid(),
});

// Drill detail endpoint for opening a node/list row without bloating graph or
// library payloads.
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = parseRequestValue(routeParamsSchema, await context.params);
    const drill = await getDrillById(userId, id);

    if (!drill) {
      return NextResponse.json({ error: "Drill not found." }, { status: 404 });
    }

    const response = parseResponseContract(drillDetailResponseSchema, { drill });
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "Failed to load drill.");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = parseRequestValue(routeParamsSchema, await context.params);
    const input = await parseJsonRequest(request, updateDrillInputSchema);
    const response = parseResponseContract(
      drillDetailResponseSchema,
      { drill: await updateDrill(userId, id, input) },
    );
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "Failed to update drill.");
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = parseRequestValue(routeParamsSchema, await context.params);
    return NextResponse.json(
      parseResponseContract(
        deleteDrillResponseSchema,
        { deletedId: await deleteDrill(userId, id) },
      ),
    );
  } catch (error) {
    return handleRouteError(error, "Failed to delete drill.");
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

  if (error instanceof UpdateDrillValidationError) {
    return NextResponse.json({ error: "Invalid drill update.", issues: error.issues }, { status: error.status });
  }

  if (error instanceof DeleteDrillValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
