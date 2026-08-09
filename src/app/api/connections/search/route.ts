import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  connectionErrorResponse,
  consumeConnectionRateLimit,
  fighterSearchResponseSchema,
  findFighterByUsername,
} from "@/modules/connections";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const username = profileUsernameSchema.parse(
      request.nextUrl.searchParams.get("username") ?? "",
    );
    await consumeConnectionRateLimit(userId, "search");
    return NextResponse.json(fighterSearchResponseSchema.parse({
      fighter: await findFighterByUsername(userId, username),
    }));
  } catch (error) {
    return connectionErrorResponse(error, "Fighter search could not be completed.");
  }
}
