import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import { parseRequestValue, parseResponseContract } from "@/modules/http/contracts";
import { journalUploadIntentResponseSchema } from "@/modules/journal/contracts";
import { journalErrorResponse } from "@/modules/journal/http";
import { refreshJournalUploadIntent } from "@/modules/journal/mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = parseRequestValue(paramsSchema, await context.params);
    return NextResponse.json(
      parseResponseContract(
        journalUploadIntentResponseSchema,
        await refreshJournalUploadIntent(userId, id),
      ),
    );
  } catch (error) {
    return journalErrorResponse(error, "Journal upload access could not be refreshed.");
  }
}
