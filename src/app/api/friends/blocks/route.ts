import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  blockFighterInputSchema,
  friendErrorResponse,
  friendMutationResponseSchema,
} from "@/modules/friends";
import { blockLegacyFighter } from "@/modules/friends/compatibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const input = blockFighterInputSchema.parse(await request.json());
    return NextResponse.json(
      friendMutationResponseSchema.parse(
        await blockLegacyFighter(currentUserId, input.userId),
      ),
      { status: 201 },
    );
  } catch (error) {
    return friendErrorResponse(error, "Fighter could not be blocked.");
  }
}
