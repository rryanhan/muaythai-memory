import { NextResponse } from "next/server";
import {
  authenticationErrorResponse,
  requireOnboardedUserId,
} from "@/modules/auth";
import { profileOverviewResponseSchema } from "@/modules/profile/contracts";
import { getProfileOverview } from "@/modules/profile/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireOnboardedUserId();
    const overview = await getProfileOverview(userId);
    return NextResponse.json(profileOverviewResponseSchema.parse({ overview }));
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
