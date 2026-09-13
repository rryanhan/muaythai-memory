import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  drillShareRecipientPageSchema,
  updateDrillShareInputSchema,
  updateDrillShareResponseSchema,
} from "@/modules/sharing/contracts";
import { drillShareErrorResponse } from "@/modules/sharing/http";
import { updateDrillShare } from "@/modules/sharing/mutations";
import { getDrillShareRecipientPage } from "@/modules/sharing/queries";
import {
  parseJsonRequest,
  parseRequestContract,
  parseRequestValue,
  parseResponseContract,
} from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerUserId = await requireOnboardedUserId();
    const { id } = parseRequestValue(paramsSchema, await context.params);
    const page = await getDrillShareRecipientPage(
      ownerUserId,
      id,
      request.nextUrl.searchParams.get("cursor"),
    ).catch((error: unknown) => parseRequestContract<never>(() => {
      throw error;
    }));
    return NextResponse.json(
      parseResponseContract(
        drillShareRecipientPageSchema,
        page,
      ),
    );
  } catch (error) {
    return drillShareErrorResponse(error, "Drill sharing options could not be loaded.");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerUserId = await requireOnboardedUserId();
    const { id } = parseRequestValue(paramsSchema, await context.params);
    const input = await parseJsonRequest(request, updateDrillShareInputSchema);
    return NextResponse.json(
      parseResponseContract(
        updateDrillShareResponseSchema,
        await updateDrillShare(
          ownerUserId,
          id,
          input.recipientUserId,
          input.shared,
        ),
      ),
    );
  } catch (error) {
    return drillShareErrorResponse(error, "Drill sharing could not be updated.");
  }
}
