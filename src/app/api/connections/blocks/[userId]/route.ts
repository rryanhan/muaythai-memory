import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  connectionErrorResponse,
  connectionMutationResponseSchema,
  unblockFighter,
} from "@/modules/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ userId: z.string().uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const { userId } = paramsSchema.parse(await context.params);
    return NextResponse.json(connectionMutationResponseSchema.parse(
      await unblockFighter(currentUserId, userId),
    ));
  } catch (error) {
    return connectionErrorResponse(error, "Fighter could not be unblocked.");
  }
}
