import { NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { authenticationErrorResponse } from "@/modules/auth/http";
import { profileOverviewResponseSchema } from "@/modules/profile/contracts";
import { getProfileOverview } from "@/modules/profile/queries";
import { parseResponseContract } from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireOnboardedUserId();
    const overview = await getProfileOverview(userId);
    return NextResponse.json(parseResponseContract(profileOverviewResponseSchema, { overview }));
  } catch (error) {
    const authResponse = authenticationErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("Profile overview failed.", error);
    return NextResponse.json(
      { error: "Profile overview could not be loaded." },
      { status: 500 },
    );
  }
}
