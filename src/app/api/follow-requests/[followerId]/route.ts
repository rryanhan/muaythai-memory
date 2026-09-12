import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  connectionMutationResponseSchema,
  respondToFollowRequestInputSchema,
} from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { respondToFollowRequest } from "@/modules/connections/mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ followerId: z.string().uuid() });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ followerId: string }> },
) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const { followerId } = paramsSchema.parse(await context.params);
    const input = respondToFollowRequestInputSchema.parse(await request.json());
    return NextResponse.json(connectionMutationResponseSchema.parse(
      await respondToFollowRequest(currentUserId, followerId, input),
    ));
  } catch (error) {
    return connectionErrorResponse(error, "Follow request could not be updated.");
  }
}
