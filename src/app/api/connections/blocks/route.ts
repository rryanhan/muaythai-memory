import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  blockFighterInputSchema,
  connectionMutationResponseSchema,
} from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { blockFighter } from "@/modules/connections/mutations";
import { parseJsonRequest, parseResponseContract } from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const input = await parseJsonRequest(request, blockFighterInputSchema);
    return NextResponse.json(
      parseResponseContract(
        connectionMutationResponseSchema,
        await blockFighter(currentUserId, input.userId),
      ),
      { status: 201 },
    );
  } catch (error) {
    return connectionErrorResponse(error, "Fighter could not be blocked.");
  }
}
