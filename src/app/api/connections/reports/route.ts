import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  connectionErrorResponse,
  reportFighter,
  reportFighterInputSchema,
  reportFighterResponseSchema,
} from "@/modules/connections";

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
