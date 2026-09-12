import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  blockFighterInputSchema,
  connectionMutationResponseSchema,
} from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { blockFighter } from "@/modules/connections/mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const input = blockFighterInputSchema.parse(await request.json());
    return NextResponse.json(
      connectionMutationResponseSchema.parse(
        await blockFighter(currentUserId, input.userId),
      ),
      { status: 201 },
    );
  } catch (error) {
    return connectionErrorResponse(error, "Fighter could not be blocked.");
  }
}
