import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  cancelFriendRequest,
  friendErrorResponse,
  friendMutationResponseSchema,
  respondToFriendRequest,
  respondToFriendRequestInputSchema,
} from "@/modules/friends";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ userId: z.string().uuid() });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const { userId } = paramsSchema.parse(await context.params);
    const input = respondToFriendRequestInputSchema.parse(await request.json());
    return NextResponse.json(
      friendMutationResponseSchema.parse(
        await respondToFriendRequest(currentUserId, userId, input),
      ),
    );
  } catch (error) {
    return friendErrorResponse(error, "Friend request could not be updated.");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const { userId } = paramsSchema.parse(await context.params);
    return NextResponse.json(
      friendMutationResponseSchema.parse(
        await cancelFriendRequest(currentUserId, userId),
      ),
    );
  } catch (error) {
    return friendErrorResponse(error, "Friend request could not be cancelled.");
  }
}
