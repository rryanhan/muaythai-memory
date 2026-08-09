import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  friendErrorResponse,
  friendMutationResponseSchema,
  sendFriendRequestInputSchema,
} from "@/modules/friends";
import { sendLegacyFriendRequest } from "@/modules/friends/compatibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const input = sendFriendRequestInputSchema.parse(await request.json());
    return NextResponse.json(
      friendMutationResponseSchema.parse(
        await sendLegacyFriendRequest(userId, input.username),
      ),
      { status: 201 },
    );
  } catch (error) {
    return friendErrorResponse(error, "Friend request could not be sent.");
  }
}
