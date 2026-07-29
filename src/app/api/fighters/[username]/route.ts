import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  fighterProfileResponseSchema,
  friendErrorResponse,
  getFighterProfileByUsername,
} from "@/modules/friends";
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
    const { username } = paramsSchema.parse(await context.params);
    const fighter = await getFighterProfileByUsername(currentUserId, username);
    if (!fighter) {
      return NextResponse.json({ error: "Fighter not found." }, { status: 404 });
    }
    return NextResponse.json(fighterProfileResponseSchema.parse({ fighter }));
  } catch (error) {
    return friendErrorResponse(error, "Fighter profile could not be loaded.");
  }
}
