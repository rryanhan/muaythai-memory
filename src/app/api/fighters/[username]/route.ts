import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { fighterProfileResponseSchema } from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { getFighterProfileByUsername } from "@/modules/connections/queries";
import { parseRequestValue, parseResponseContract } from "@/modules/http/contracts";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ username: profileUsernameSchema });

export async function GET(
  _request: Request,
  context: { params: Promise<{ username: string }> },
) {
  try {
    const currentUserId = await requireOnboardedUserId();
    const { username } = parseRequestValue(paramsSchema, await context.params);
    const fighter = await getFighterProfileByUsername(currentUserId, username);
    if (!fighter) {
      return NextResponse.json({ error: "Fighter not found." }, { status: 404 });
    }
    return NextResponse.json(parseResponseContract(fighterProfileResponseSchema, { fighter }));
  } catch (error) {
    return connectionErrorResponse(error, "Fighter profile could not be loaded.");
  }
}
