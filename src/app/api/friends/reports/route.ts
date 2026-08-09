import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  friendErrorResponse,
  reportFighterInputSchema,
  reportFighterResponseSchema,
} from "@/modules/friends";
import { reportLegacyFighter } from "@/modules/friends/compatibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const input = reportFighterInputSchema.parse(await request.json());
    return NextResponse.json(
      reportFighterResponseSchema.parse(
        await reportLegacyFighter(
          currentUserId,
          input.userId,
          input.reason,
          input.details,
        ),
      ),
      { status: 201 },
    );
  } catch (error) {
    return friendErrorResponse(error, "Fighter report could not be submitted.");
  }
}
