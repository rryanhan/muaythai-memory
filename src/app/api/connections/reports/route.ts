import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  reportFighterInputSchema,
  reportFighterResponseSchema,
} from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { reportFighter } from "@/modules/connections/mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const input = reportFighterInputSchema.parse(await request.json());
    return NextResponse.json(
      reportFighterResponseSchema.parse(await reportFighter(
        currentUserId,
        input.userId,
        input.reason,
        input.details,
      )),
      { status: 201 },
    );
  } catch (error) {
    return connectionErrorResponse(error, "Fighter report could not be submitted.");
  }
}
