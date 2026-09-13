import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  connectionMutationResponseSchema,
  respondToFollowRequestInputSchema,
} from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { respondToFollowRequest } from "@/modules/connections/mutations";
import {
  parseJsonRequest,
  parseRequestValue,
  parseResponseContract,
} from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ followerId: z.string().uuid() });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ followerId: string }> },
) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const { followerId } = parseRequestValue(paramsSchema, await context.params);
    const input = await parseJsonRequest(request, respondToFollowRequestInputSchema);
    return NextResponse.json(parseResponseContract(
      connectionMutationResponseSchema,
      await respondToFollowRequest(currentUserId, followerId, input),
    ));
  } catch (error) {
    return connectionErrorResponse(error, "Follow request could not be updated.");
  }
}
