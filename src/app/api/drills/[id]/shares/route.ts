import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  drillShareErrorResponse,
  drillShareFriendPageSchema,
  getDrillShareFriendPage,
  updateDrillShare,
  updateDrillShareInputSchema,
  updateDrillShareResponseSchema,
} from "@/modules/sharing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerUserId = await requireOnboardedUserId();
    const { id } = paramsSchema.parse(await context.params);
    return NextResponse.json(
      drillShareFriendPageSchema.parse(
        await getDrillShareFriendPage(
          ownerUserId,
          id,
          request.nextUrl.searchParams.get("cursor"),
        ),
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
    const { id } = paramsSchema.parse(await context.params);
    const input = updateDrillShareInputSchema.parse(await request.json());
    return NextResponse.json(
      updateDrillShareResponseSchema.parse(
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
