import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  consumeFriendRateLimit,
  fighterSearchResponseSchema,
  findFighterByUsername,
  friendErrorResponse,
} from "@/modules/friends";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const username = profileUsernameSchema.parse(
      request.nextUrl.searchParams.get("username") ?? "",
    );
    await consumeFriendRateLimit(userId, "search");
    return NextResponse.json(
      fighterSearchResponseSchema.parse({
        fighter: await findFighterByUsername(userId, username),
      }),
    );
  } catch (error) {
    return friendErrorResponse(error, "Fighter search could not be completed.");
  }
}
