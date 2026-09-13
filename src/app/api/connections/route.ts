import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  connectionSectionPageResponseSchema,
  connectionSectionSchema,
  connectionsSummaryResponseSchema,
} from "@/modules/connections/contracts";
import { connectionErrorResponse } from "@/modules/connections/http";
import {
  getConnectionSectionPage,
  getConnectionsSummary,
} from "@/modules/connections/queries";
import { parseRequestContract, parseResponseContract } from "@/modules/http/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const rawSection = request.nextUrl.searchParams.get("section");
    if (rawSection) {
      const query = parseRequestContract(() => {
        const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
        return {
          section: connectionSectionSchema.parse(rawSection),
          cursor: request.nextUrl.searchParams.get("cursor"),
          limit: Number.isFinite(rawLimit) ? rawLimit : 20,
        };
      });
      const page = await getConnectionSectionPage(
        userId,
        query.section,
        query.cursor,
        query.limit,
      ).catch((error: unknown) => parseRequestContract<never>(() => {
        throw error;
      }));
      return NextResponse.json(parseResponseContract(
        connectionSectionPageResponseSchema,
        page,
      ));
    }
    return NextResponse.json(
      parseResponseContract(
        connectionsSummaryResponseSchema,
        await getConnectionsSummary(userId),
      ),
    );
  } catch (error) {
    return connectionErrorResponse(error, "Connections could not be loaded.");
  }
}
