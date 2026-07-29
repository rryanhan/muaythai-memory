import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  friendErrorResponse,
  removeFriend,
  removeFriendResponseSchema,
} from "@/modules/friends";

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
    return NextResponse.json(
      removeFriendResponseSchema.parse(
        await removeFriend(currentUserId, userId),
      ),
    );
  } catch (error) {
    return friendErrorResponse(error, "Friend could not be removed.");
  }
}
