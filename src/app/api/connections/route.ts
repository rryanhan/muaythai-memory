import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  connectionErrorResponse,
  connectionSectionPageResponseSchema,
  connectionSectionSchema,
  connectionsSummaryResponseSchema,
  getConnectionSectionPage,
  getConnectionsSummary,
} from "@/modules/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const rawSection = request.nextUrl.searchParams.get("section");
    if (rawSection) {
      const section = connectionSectionSchema.parse(rawSection);
      const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
      return NextResponse.json(connectionSectionPageResponseSchema.parse(
        await getConnectionSectionPage(
          userId,
          section,
          request.nextUrl.searchParams.get("cursor"),
          Number.isFinite(rawLimit) ? rawLimit : 20,
        ),
      ));
    }
    return NextResponse.json(
      connectionsSummaryResponseSchema.parse(await getConnectionsSummary(userId)),
    );
  } catch (error) {
    return connectionErrorResponse(error, "Connections could not be loaded.");
  }
}
