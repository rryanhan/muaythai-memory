import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { fighterSearchResponseSchema } from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { consumeConnectionRateLimit } from "@/modules/connections/limits";
import { findFighterByUsername } from "@/modules/connections/queries";
import { parseRequestValue, parseResponseContract } from "@/modules/http/contracts";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const username = parseRequestValue(
      profileUsernameSchema,
      request.nextUrl.searchParams.get("username") ?? "",
    );
    await consumeConnectionRateLimit(userId, "search");
    return NextResponse.json(parseResponseContract(
      fighterSearchResponseSchema,
      { fighter: await findFighterByUsername(userId, username) },
    ));
  } catch (error) {
    return connectionErrorResponse(error, "Fighter search could not be completed.");
  }
}
