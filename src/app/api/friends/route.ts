import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  friendSectionPageResponseSchema,
  friendSectionSchema,
  friendErrorResponse,
  friendsSummaryResponseSchema,
} from "@/modules/friends";
import {
  getLegacyFriendsSummary,
  getLegacyFriendSectionPage,
} from "@/modules/friends/compatibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const rawSection = request.nextUrl.searchParams.get("section");
    if (rawSection) {
      const section = friendSectionSchema.parse(rawSection);
      const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
      return NextResponse.json(
        friendSectionPageResponseSchema.parse(
          await getLegacyFriendSectionPage(
            userId,
            section,
            request.nextUrl.searchParams.get("cursor"),
            Number.isFinite(rawLimit) ? rawLimit : 20,
          ),
        ),
      );
    }

    return NextResponse.json(
      friendsSummaryResponseSchema.parse(await getLegacyFriendsSummary(userId)),
    );
  } catch (error) {
    return friendErrorResponse(error, "Friends could not be loaded.");
  }
}
