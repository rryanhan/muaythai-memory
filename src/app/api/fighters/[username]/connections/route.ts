import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  authorizedConnectionPageResponseSchema,
  connectionErrorResponse,
  getAuthorizedConnectionPage,
  publicConnectionSectionSchema,
} from "@/modules/connections";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ username: profileUsernameSchema });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> },
) {
  try {
    const viewerUserId = await requireOnboardedUserId();
    const { username } = paramsSchema.parse(await context.params);
    const section = publicConnectionSectionSchema.parse(
      request.nextUrl.searchParams.get("section") ?? "followers",
    );
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
    const page = await getAuthorizedConnectionPage(
      viewerUserId,
      username,
      section,
      request.nextUrl.searchParams.get("cursor"),
      Number.isFinite(rawLimit) ? rawLimit : 20,
    );
    if (!page) {
      return NextResponse.json({ error: "Fighter not found." }, { status: 404 });
    }
    return NextResponse.json(authorizedConnectionPageResponseSchema.parse(page));
  } catch (error) {
    return connectionErrorResponse(error, "Connections could not be loaded.");
  }
}
