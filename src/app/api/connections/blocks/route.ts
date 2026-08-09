import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  blockFighter,
  blockFighterInputSchema,
  connectionErrorResponse,
  connectionMutationResponseSchema,
} from "@/modules/connections";

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
