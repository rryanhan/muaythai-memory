import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { parseRequestValue, parseResponseContract } from "@/modules/http/contracts";
import { journalPreviewResponseSchema } from "@/modules/journal/contracts";
import { journalErrorResponse } from "@/modules/journal/http";
import { getJournalPreviewForDrill } from "@/modules/journal/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = parseRequestValue(paramsSchema, await context.params);
    const preview = await getJournalPreviewForDrill(userId, id);
    if (!preview) return NextResponse.json({ error: "Drill not found." }, { status: 404 });
    return NextResponse.json(parseResponseContract(journalPreviewResponseSchema, preview));
  } catch (error) {
    return journalErrorResponse(error, "Related training clip could not be loaded.");
  }
}
