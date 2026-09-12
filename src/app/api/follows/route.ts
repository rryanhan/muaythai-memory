import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  connectionMutationResponseSchema,
  requestFollowInputSchema,
} from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { requestFollow } from "@/modules/connections/mutations";

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
