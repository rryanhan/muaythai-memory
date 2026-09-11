import { NextRequest, NextResponse } from "next/server";
import { requireOnboardedUserId } from "@/modules/auth";
import {
  createJournalUploadInputSchema,
  journalUploadIntentResponseSchema,
} from "@/modules/journal/contracts";
import { journalErrorResponse } from "@/modules/journal/http";
import { createJournalUploadIntent } from "@/modules/journal/mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireOnboardedUserId();
    const input = createJournalUploadInputSchema.parse(await request.json());
    return NextResponse.json(
      journalUploadIntentResponseSchema.parse(await createJournalUploadIntent(userId, input)),
      { status: 201 },
    );
  } catch (error) {
    return journalErrorResponse(error, "Journal upload could not be started.");
  }
}
