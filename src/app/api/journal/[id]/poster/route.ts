import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  parseFormDataRequest,
  parseRequestValue,
  parseResponseContract,
} from "@/modules/http/contracts";
import { journalPosterUploadResponseSchema } from "@/modules/journal/contracts";
import { journalErrorResponse } from "@/modules/journal/http";
import { saveJournalPoster } from "@/modules/journal/mutations";
import { JournalPosterError } from "@/modules/journal/poster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = parseRequestValue(paramsSchema, await context.params);
    const formData = await parseFormDataRequest(request);
    const poster = formData.get("poster");
    if (!(poster instanceof File)) {
      return NextResponse.json({ error: "Journal poster must be an uploaded image." }, { status: 400 });
    }

    await saveJournalPoster(userId, id, poster);
    return NextResponse.json(
      parseResponseContract(journalPosterUploadResponseSchema, { uploaded: true }),
    );
  } catch (error) {
    if (error instanceof JournalPosterError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return journalErrorResponse(error, "Journal poster could not be saved.");
  }
}
