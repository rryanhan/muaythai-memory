import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedAppUser } from "@/modules/auth";
import { journalUploadIntentResponseSchema } from "@/modules/journal/contracts";
import { journalErrorResponse } from "@/modules/journal/http";
import { refreshJournalUploadIntent } from "@/modules/journal/mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOnboardedAppUser();
    const { id } = paramsSchema.parse(await context.params);
    return NextResponse.json(
      journalUploadIntentResponseSchema.parse(await refreshJournalUploadIntent(user.id, id)),
    );
  } catch (error) {
    return journalErrorResponse(error, "Journal upload access could not be refreshed.");
  }
}
