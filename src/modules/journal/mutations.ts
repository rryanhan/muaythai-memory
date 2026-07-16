import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { drills, journalEntries, journalMedia } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  JOURNAL_ABANDONED_UPLOAD_HOURS,
  JOURNAL_MEDIA_BUCKET,
  isJournalVideoMime,
  journalVideoExtension,
} from "./constants";
import {
  createJournalUploadInputSchema,
  updateJournalEntryInputSchema,
  type CreateJournalUploadInput,
  type JournalEntryDetail,
  type JournalUploadIntentResponse,
  type UpdateJournalEntryInput,
} from "./contracts";
import { getJournalEntryById, getOwnedJournalRow } from "./queries";

export class JournalMutationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "JournalMutationError";
    this.status = status;
  }
}

export async function createJournalUploadIntent(
  userId: string,
  rawInput: CreateJournalUploadInput,
): Promise<JournalUploadIntentResponse> {
  const input = createJournalUploadInputSchema.parse(rawInput);
  if (input.drillId) await assertOwnedDrill(userId, input.drillId);

  const entryId = randomUUID();
  const path = `${userId}/${entryId}/${randomUUID()}.${journalVideoExtension(input.mimeType)}`;

  await db.transaction(async (tx) => {
    await tx.insert(journalEntries).values({
      id: entryId,
      userId,
      drillId: input.drillId ?? null,
      occurredOn: input.occurredOn,
      caption: input.caption,
      status: "uploading",
    });
    await tx.insert(journalMedia).values({
      journalEntryId: entryId,
      storagePath: path,
      mediaKind: "video",
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      durationMs: input.durationMs ?? null,
    });
  });

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(JOURNAL_MEDIA_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) throw new Error(error?.message ?? "No upload token returned.");

    return {
      entryId,
      upload: {
        endpoint: getResumableStorageEndpoint(),
        token: data.token,
        path,
      },
    };
  } catch (error) {
    await db.delete(journalEntries).where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)));
    throw error;
  }
}

export async function completeJournalUpload(userId: string, entryId: string): Promise<JournalEntryDetail> {
  const current = await getOwnedJournalRow(userId, entryId);
  if (!current) throw new JournalMutationError("Journal entry not found.", 404);
  if (current.status === "ready") {
    const readyEntry = await getJournalEntryById(userId, entryId);
    if (!readyEntry) throw new JournalMutationError("Journal entry not found.", 404);
    return readyEntry;
  }

  const supabase = createSupabaseAdminClient();
  const bucket = supabase.storage.from(JOURNAL_MEDIA_BUCKET);
  const { data: info, error } = await bucket.info(current.storagePath);
  if (error || !info) throw new JournalMutationError("The uploaded video could not be confirmed. Try again.", 409);

  const contentType = info.contentType ?? "";
  if (
    info.size !== current.sizeBytes ||
    !isJournalVideoMime(contentType) ||
    contentType !== current.mimeType
  ) {
    await bucket.remove([current.storagePath]).catch(() => undefined);
    await db.delete(journalEntries).where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)));
    throw new JournalMutationError("The uploaded video did not match the selected file.", 400);
  }

  const [updated] = await db
    .update(journalEntries)
    .set({ status: "ready", updatedAt: new Date() })
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId), eq(journalEntries.status, "uploading")))
    .returning({ id: journalEntries.id });
  if (!updated) throw new JournalMutationError("Journal entry could not be completed.", 409);

  const entry = await getJournalEntryById(userId, entryId);
  if (!entry) throw new JournalMutationError("Completed journal entry could not be loaded.", 404);
  return entry;
}

export async function updateJournalEntry(
  userId: string,
  entryId: string,
  rawInput: UpdateJournalEntryInput,
): Promise<JournalEntryDetail> {
  const input = updateJournalEntryInputSchema.parse(rawInput);
  const current = await getOwnedJournalRow(userId, entryId);
  if (!current) throw new JournalMutationError("Journal entry not found.", 404);
  if (current.status !== "ready") {
    throw new JournalMutationError("Finish the video upload before editing this entry.", 409);
  }
  if (input.drillId) await assertOwnedDrill(userId, input.drillId);

  const [updated] = await db
    .update(journalEntries)
    .set({
      occurredOn: input.occurredOn,
      caption: input.caption,
      drillId: input.drillId ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)))
    .returning({ id: journalEntries.id });
  if (!updated) throw new JournalMutationError("Journal entry not found.", 404);

  const entry = await getJournalEntryById(userId, entryId);
  if (!entry) throw new JournalMutationError("Updated journal entry could not be loaded.", 404);
  return entry;
}

export async function deleteJournalEntry(userId: string, entryId: string): Promise<string> {
  const current = await getOwnedJournalRow(userId, entryId);
  if (!current) throw new JournalMutationError("Journal entry not found.", 404);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(JOURNAL_MEDIA_BUCKET).remove([current.storagePath]);
  if (error) throw new JournalMutationError("Journal video could not be removed. Try again.", 503);

  const [deleted] = await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)))
    .returning({ id: journalEntries.id });
  if (!deleted) throw new JournalMutationError("Journal entry not found.", 404);
  return deleted.id;
}

export async function cleanupAbandonedJournalUploads(now = new Date()): Promise<{ removed: number; failed: number }> {
  const cutoff = new Date(now.getTime() - JOURNAL_ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({ id: journalEntries.id, storagePath: journalMedia.storagePath })
    .from(journalEntries)
    .innerJoin(journalMedia, eq(journalMedia.journalEntryId, journalEntries.id))
    .where(and(eq(journalEntries.status, "uploading"), lt(journalEntries.createdAt, cutoff)));
  if (rows.length === 0) return { removed: 0, failed: 0 };

  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  const removableIds: string[] = [];
  let failed = 0;

  for (const row of rows) {
    const { error } = await bucket.remove([row.storagePath]);
    if (error) {
      failed += 1;
      continue;
    }
    removableIds.push(row.id);
  }

  if (removableIds.length > 0) {
    await db.delete(journalEntries).where(inArray(journalEntries.id, removableIds));
  }
  return { removed: removableIds.length, failed };
}

async function assertOwnedDrill(userId: string, drillId: string): Promise<void> {
  const [drill] = await db
    .select({ id: drills.id })
    .from(drills)
    .where(and(eq(drills.id, drillId), eq(drills.userId, userId)))
    .limit(1);
  if (!drill) throw new JournalMutationError("Linked drill not found.", 404);
}

function getResumableStorageEndpoint(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  const projectRef = new URL(rawUrl).hostname.split(".")[0];
  if (!projectRef) throw new Error("Supabase project reference could not be determined.");
  // Signed TUS tokens use Supabase's dedicated resumable signing endpoint.
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable/sign`;
}
