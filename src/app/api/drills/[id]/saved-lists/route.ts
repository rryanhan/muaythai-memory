import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";
import {
  updateSavedListInputSchema,
  updateSavedListResponseSchema,
} from "@/modules/drills/contracts";
import { SavedListMutationError, setDrillSavedList } from "@/modules/drills/mutations";
import {
  parseJsonRequest,
  parseRequestValue,
  parseResponseContract,
  RequestContractError,
} from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const routeParamsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = parseRequestValue(routeParamsSchema, await context.params);
    const input = await parseJsonRequest(request, updateSavedListInputSchema);
    const response = parseResponseContract(
      updateSavedListResponseSchema,
      await setDrillSavedList(userId, id, input),
    );
    return NextResponse.json(response);
  } catch (error) {
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof RequestContractError) {
      return NextResponse.json(
        {
          error: "Invalid Saved List request.",
          ...(error.issues ? { issues: error.issues } : {}),
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
