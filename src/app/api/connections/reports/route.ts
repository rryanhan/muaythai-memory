import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  reportFighterInputSchema,
  reportFighterResponseSchema,
} from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { reportFighter } from "@/modules/connections/mutations";
import { parseJsonRequest, parseResponseContract } from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const input = await parseJsonRequest(request, reportFighterInputSchema);
    return NextResponse.json(
      parseResponseContract(
        reportFighterResponseSchema,
        await reportFighter(
          currentUserId,
          input.userId,
          input.reason,
          input.details,
        ),
      ),
      { status: 201 },
    );
  } catch (error) {
    return connectionErrorResponse(error, "Fighter report could not be submitted.");
  }
}
