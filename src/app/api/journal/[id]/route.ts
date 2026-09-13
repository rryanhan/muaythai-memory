import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOnboardedUserId } from "@/modules/auth/current-user";
import {
  parseJsonRequest,
  parseRequestValue,
  parseResponseContract,
} from "@/modules/http/contracts";
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
    const { id } = parseRequestValue(paramsSchema, await context.params);
    const entry = await getJournalEntryById(userId, id);
    if (!entry) return NextResponse.json({ error: "Journal entry not found." }, { status: 404 });
    return NextResponse.json(parseResponseContract(journalDetailResponseSchema, { entry }));
  } catch (error) {
    return journalErrorResponse(error, "Journal entry could not be loaded.");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = parseRequestValue(paramsSchema, await context.params);
    const input = await parseJsonRequest(request, updateJournalEntryInputSchema);
    const entry = await updateJournalEntry(userId, id, input);
    return NextResponse.json(parseResponseContract(journalDetailResponseSchema, { entry }));
  } catch (error) {
    return journalErrorResponse(error, "Journal entry could not be updated.");
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireOnboardedUserId();
    const { id } = parseRequestValue(paramsSchema, await context.params);
    return NextResponse.json(
      parseResponseContract(
        deleteJournalEntryResponseSchema,
        { deletedId: await deleteJournalEntry(userId, id) },
      ),
    );
  } catch (error) {
    return journalErrorResponse(error, "Journal entry could not be deleted.");
  }
}
