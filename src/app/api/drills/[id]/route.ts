import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
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
import {
  authenticationErrorResponse,
  requireOnboardedAppUser,
  requireOnboardedUserId,
} from "@/modules/auth";

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
    const { id } = routeParamsSchema.parse(await context.params);
    const drill = await getDrillById(userId, id);

    if (!drill) {
      return NextResponse.json({ error: "Drill not found." }, { status: 404 });
    }

    const response = drillDetailResponseSchema.parse({ drill });
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "Failed to load drill.");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOnboardedAppUser();
    const { id } = routeParamsSchema.parse(await context.params);
    const input = updateDrillInputSchema.parse(await request.json());
    const response = drillDetailResponseSchema.parse({ drill: await updateDrill(user.id, id, input) });
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "Failed to update drill.");
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOnboardedAppUser();
    const { id } = routeParamsSchema.parse(await context.params);
    return NextResponse.json(
      deleteDrillResponseSchema.parse({ deletedId: await deleteDrill(user.id, id) }),
    );
  } catch (error) {
    return handleRouteError(error, "Failed to delete drill.");
  }
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  const authResponse = authenticationErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid drill id or response shape.", issues: error.issues }, { status: 400 });
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
