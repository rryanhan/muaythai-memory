import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { authenticationErrorResponse, requireOnboardedUserId } from "@/modules/auth";
import {
  updateSavedListInputSchema,
  updateSavedListResponseSchema,
} from "@/modules/drills/contracts";
import { SavedListMutationError, setDrillSavedList } from "@/modules/drills/mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const routeParamsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = routeParamsSchema.parse(await context.params);
    const input = updateSavedListInputSchema.parse(await request.json());
    const response = updateSavedListResponseSchema.parse(await setDrillSavedList(userId, id, input));
    return NextResponse.json(response);
  } catch (error) {
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: "Invalid Saved List request.",
          ...(error instanceof ZodError ? { issues: error.issues } : {}),
        },
        { status: 400 },
      );
    }

    if (error instanceof SavedListMutationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to update Saved List.", error);
    return NextResponse.json({ error: "Failed to update Saved List." }, { status: 500 });
  }
}
