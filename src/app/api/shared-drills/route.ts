import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import { profileUsernameSchema } from "@/modules/profile/contracts";
import {
  drillShareErrorResponse,
  listSharedDrills,
  sharedDrillListResponseSchema,
} from "@/modules/sharing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const rawOwner = request.nextUrl.searchParams.get("owner");
    const ownerUsername = rawOwner
      ? profileUsernameSchema.parse(rawOwner)
      : undefined;
    return NextResponse.json(
      sharedDrillListResponseSchema.parse(
        await listSharedDrills(
          userId,
          request.nextUrl.searchParams.get("cursor"),
          ownerUsername,
        ),
      ),
    );
  } catch (error) {
    return drillShareErrorResponse(error, "Shared drills could not be loaded.");
  }
}
