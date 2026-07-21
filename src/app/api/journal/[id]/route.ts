import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedAppUser, requireOnboardedUserId } from "@/modules/auth";
import {
  deleteJournalEntryResponseSchema,
  journalDetailResponseSchema,
  updateJournalEntryInputSchema,
} from "@/modules/journal/contracts";
import { journalErrorResponse } from "@/modules/journal/http";
import { deleteJournalEntry, updateJournalEntry } from "@/modules/journal/mutations";
import { getJournalEntryById } from "@/modules/journal/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = paramsSchema.parse(await context.params);
    const entry = await getJournalEntryById(userId, id);
    if (!entry) return NextResponse.json({ error: "Journal entry not found." }, { status: 404 });
    return NextResponse.json(journalDetailResponseSchema.parse({ entry }));
  } catch (error) {
    return journalErrorResponse(error, "Journal entry could not be loaded.");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOnboardedAppUser();
    const { id } = paramsSchema.parse(await context.params);
    const input = updateJournalEntryInputSchema.parse(await request.json());
    const entry = await updateJournalEntry(user.id, id, input);
    return NextResponse.json(journalDetailResponseSchema.parse({ entry }));
  } catch (error) {
    return journalErrorResponse(error, "Journal entry could not be updated.");
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOnboardedAppUser();
    const { id } = paramsSchema.parse(await context.params);
    return NextResponse.json(
      deleteJournalEntryResponseSchema.parse({ deletedId: await deleteJournalEntry(user.id, id) }),
    );
  } catch (error) {
    return journalErrorResponse(error, "Journal entry could not be deleted.");
  }
}
