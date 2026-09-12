import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { fighterSearchResponseSchema } from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { consumeConnectionRateLimit } from "@/modules/connections/limits";
import { findFighterByUsername } from "@/modules/connections/queries";
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
