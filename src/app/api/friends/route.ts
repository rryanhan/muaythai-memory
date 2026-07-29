import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  friendSectionPageResponseSchema,
  friendSectionSchema,
  friendErrorResponse,
  friendsSummaryResponseSchema,
  getFriendsSummary,
  getFriendSectionPage,
} from "@/modules/friends";

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
          await getFriendSectionPage(
            userId,
            section,
            request.nextUrl.searchParams.get("cursor"),
            Number.isFinite(rawLimit) ? rawLimit : 20,
          ),
        ),
      );
    }

    return NextResponse.json(
      friendsSummaryResponseSchema.parse(await getFriendsSummary(userId)),
    );
  } catch (error) {
    return friendErrorResponse(error, "Friends could not be loaded.");
  }
}
