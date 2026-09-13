import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  authorizedConnectionPageResponseSchema,
  publicConnectionSectionSchema,
} from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import { getAuthorizedConnectionPage } from "@/modules/connections/queries";
import {
  parseRequestContract,
  parseRequestValue,
  parseResponseContract,
} from "@/modules/http/contracts";
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
    const { username } = parseRequestValue(paramsSchema, await context.params);
    const query = parseRequestContract(() => {
      const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
      return {
        section: publicConnectionSectionSchema.parse(
          request.nextUrl.searchParams.get("section") ?? "followers",
        ),
        cursor: request.nextUrl.searchParams.get("cursor"),
        limit: Number.isFinite(rawLimit) ? rawLimit : 20,
      };
    });
    const page = await getAuthorizedConnectionPage(
      viewerUserId,
      username,
      query.section,
      query.cursor,
      query.limit,
    ).catch((error: unknown) => parseRequestContract<never>(() => {
      throw error;
    }));
    if (!page) {
      return NextResponse.json({ error: "Fighter not found." }, { status: 404 });
    }
    return NextResponse.json(parseResponseContract(authorizedConnectionPageResponseSchema, page));
  } catch (error) {
    return connectionErrorResponse(error, "Connections could not be loaded.");
  }
}
