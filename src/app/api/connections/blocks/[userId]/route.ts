import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { connectionMutationResponseSchema } from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { unblockFighter } from "@/modules/connections/mutations";
import { parseRequestValue, parseResponseContract } from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ userId: z.string().uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const { userId } = parseRequestValue(paramsSchema, await context.params);
    return NextResponse.json(parseResponseContract(
      connectionMutationResponseSchema,
      await unblockFighter(currentUserId, userId),
    ));
  } catch (error) {
    return connectionErrorResponse(error, "Fighter could not be unblocked.");
  }
}
