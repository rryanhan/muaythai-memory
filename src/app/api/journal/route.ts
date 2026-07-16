import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUserId } from "@/modules/auth";
import { journalListResponseSchema } from "@/modules/journal/contracts";
import { journalErrorResponse } from "@/modules/journal/http";
import { isOwnedDrill, listJournalEntries } from "@/modules/journal/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const listParamsSchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  drillId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = await requireCurrentUserId();
    const params = listParamsSchema.parse({
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      drillId: request.nextUrl.searchParams.get("drillId") ?? undefined,
    });
    if (params.drillId && !(await isOwnedDrill(userId, params.drillId))) {
      return NextResponse.json({ error: "Drill not found." }, { status: 404 });
    }
    return NextResponse.json(
      journalListResponseSchema.parse(await listJournalEntries(userId, params)),
    );
  } catch (error) {
    return journalErrorResponse(error, "Journal entries could not be loaded.");
  }
}
