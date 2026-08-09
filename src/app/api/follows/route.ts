import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  connectionErrorResponse,
  connectionMutationResponseSchema,
  requestFollow,
  requestFollowInputSchema,
} from "@/modules/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const input = requestFollowInputSchema.parse(await request.json());
    return NextResponse.json(
      connectionMutationResponseSchema.parse(await requestFollow(userId, input.username)),
      { status: 201 },
    );
  } catch (error) {
    return connectionErrorResponse(error, "Follow request could not be sent.");
  }
}
