import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedAppUser } from "@/modules/auth";
import { completeJournalUploadResponseSchema } from "@/modules/journal/contracts";
import { journalErrorResponse } from "@/modules/journal/http";
import { completeJournalUpload } from "@/modules/journal/mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOnboardedAppUser();
    const { id } = paramsSchema.parse(await context.params);
    return NextResponse.json(
      completeJournalUploadResponseSchema.parse({ entry: await completeJournalUpload(user.id, id) }),
    );
  } catch (error) {
    return journalErrorResponse(error, "Journal upload could not be completed.");
  }
}
