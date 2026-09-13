import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { profileUsernameSchema } from "@/modules/profile/contracts";
import { sharedDrillListResponseSchema } from "@/modules/sharing/contracts";
import { drillShareErrorResponse } from "@/modules/sharing/http";
import { listSharedDrills } from "@/modules/sharing/queries";
import { parseRequestContract, parseResponseContract } from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const query = parseRequestContract(() => {
      const rawOwner = request.nextUrl.searchParams.get("owner");
      return {
        cursor: request.nextUrl.searchParams.get("cursor"),
        ownerUsername: rawOwner ? profileUsernameSchema.parse(rawOwner) : undefined,
      };
    });
    const page = await listSharedDrills(
      userId,
      query.cursor,
      query.ownerUsername,
    ).catch((error: unknown) => parseRequestContract<never>(() => {
      throw error;
    }));
    return NextResponse.json(
      parseResponseContract(
        sharedDrillListResponseSchema,
        page,
      ),
    );
  } catch (error) {
    return drillShareErrorResponse(error, "Shared drills could not be loaded.");
  }
}
