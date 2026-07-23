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
import { uploadJournalPosterObject } from "./poster";
import { cleanupRejectedJournalUpload } from "./rejected-upload";

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
  const supabase = createSupabaseAdminClient();
  const bucket = supabase.storage.from(JOURNAL_MEDIA_BUCKET);
  const outcome = await db.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (!current) throw new JournalMutationError("Journal entry not found.", 404);
    if (current.status === "ready") return { kind: "ready" } as const;
    if (current.status !== "uploading") {
      throw new JournalMutationError("Journal entry could not be completed.", 409);
    }
    if (!current.posterPath) {
      throw new JournalMutationError("Choose a journal cover before completing the upload.", 409);
    }

    const rejectUpload = async (reason: "missing" | "mismatch") => {
      const paths = [current.storagePath, current.posterPath].filter((path): path is string => Boolean(path));
      const cleanup = await cleanupRejectedJournalUpload(paths, {
        async removeObjects(objectPaths) {
          try {
            const result = await bucket.remove(objectPaths);
            return {
              error: result.error && !isStorageNotFoundError(result.error) ? result.error : null,
            };
          } catch (error) {
            if (isStorageNotFoundError(error)) return { error: null };
            throw error;
          }
        },
        async deleteUploadRecord() {
          const [deleted] = await tx
            .delete(journalEntries)
            .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)))
            .returning({ id: journalEntries.id });
          if (!deleted) throw new Error("Journal upload record was not deleted.");
        },
      });
      if (!cleanup.ok) {
        console.error(
          `Rejected journal upload ${cleanup.stage} cleanup failed.`,
          cleanup.error instanceof Error ? cleanup.error.message : cleanup.error,
        );
        throw new JournalMutationError(
          cleanup.stage === "database"
            ? "The rejected files were removed, but the upload record remains. Retry to finish cleanup."
            : "The uploaded video was rejected, but its files could not be cleaned up. Try again.",
          503,
        );
      }
      return { kind: "rejected", reason } as const;
    };

    let infoResult: Awaited<ReturnType<typeof bucket.info>>;
    try {
      infoResult = await bucket.info(current.storagePath);
    } catch (error) {
      if (isStorageNotFoundError(error)) return rejectUpload("missing");
      throw new JournalMutationError("The uploaded video could not be confirmed. Try again.", 409);
    }

    if (infoResult.error) {
      if (isStorageNotFoundError(infoResult.error)) return rejectUpload("missing");
      throw new JournalMutationError("The uploaded video could not be confirmed. Try again.", 409);
    }
    if (!infoResult.data) {
      throw new JournalMutationError("The uploaded video could not be confirmed. Try again.", 409);
    }

    const contentType = infoResult.data.contentType ?? "";
    if (
      infoResult.data.size !== current.sizeBytes
      || !isJournalVideoMime(contentType)
      || contentType !== current.mimeType
    ) {
      return rejectUpload("mismatch");
    }

    const [updated] = await tx
      .update(journalEntries)
      .set({ status: "ready", updatedAt: new Date() })
      .where(and(
        eq(journalEntries.id, entryId),
        eq(journalEntries.userId, userId),
        eq(journalEntries.status, "uploading"),
      ))
      .returning({ id: journalEntries.id });
    if (!updated) throw new JournalMutationError("Journal entry could not be completed.", 409);
    return { kind: "completed" } as const;
  });

  if (outcome.kind === "rejected") {
    throw new JournalMutationError(
      outcome.reason === "missing"
        ? "The uploaded video is no longer available. Select it again."
        : "The uploaded video did not match the selected file.",
      outcome.reason === "missing" ? 409 : 400,
    );
  }

  const entry = await getJournalEntryById(userId, entryId);
  if (!entry) throw new JournalMutationError("Completed journal entry could not be loaded.", 404);
  return entry;
}

export async function saveJournalPoster(userId: string, entryId: string, file: File): Promise<void> {
  const posterPath = await uploadJournalPosterObject(userId, entryId, file);
  let outcome:
    | { kind: "saved"; previousPosterPath: string | null }
    | { kind: "missing" | "not-uploading" };
  try {
    outcome = await db.transaction(async (tx) => {
      const current = await getLockedJournalUpload(tx, userId, entryId);
      if (!current) return { kind: "missing" } as const;
      if (current.status !== "uploading") return { kind: "not-uploading" } as const;

      const [updated] = await tx
        .update(journalMedia)
        .set({ posterPath, updatedAt: new Date() })
        .where(and(eq(journalMedia.id, current.mediaId), eq(journalMedia.journalEntryId, entryId)))
        .returning({ id: journalMedia.id });
      if (!updated) throw new JournalMutationError("Journal entry not found.", 404);
      return { kind: "saved", previousPosterPath: current.posterPath } as const;
    });
  } catch (error) {
    await removeLosingPoster(posterPath, error);
    throw error;
  }

  if (outcome.kind !== "saved") {
    await removeLosingPoster(posterPath);
    if (outcome.kind === "missing") throw new JournalMutationError("Journal entry not found.", 404);
    throw new JournalMutationError("Journal poster can only be added while the video is uploading.", 409);
  }

  if (outcome.previousPosterPath && outcome.previousPosterPath !== posterPath) {
    const cleanupError = await removeJournalStoragePaths([outcome.previousPosterPath]);
    if (cleanupError) {
      console.error(
        "Previous journal poster cleanup failed.",
        cleanupError instanceof Error ? cleanupError.message : cleanupError,
      );
    }
  }
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
  const paths = [current.storagePath, current.posterPath].filter((path): path is string => Boolean(path));
  const { error } = await supabase.storage.from(JOURNAL_MEDIA_BUCKET).remove(paths);
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
    .select({ id: journalEntries.id, storagePath: journalMedia.storagePath, posterPath: journalMedia.posterPath })
    .from(journalEntries)
    .innerJoin(journalMedia, eq(journalMedia.journalEntryId, journalEntries.id))
    .where(and(eq(journalEntries.status, "uploading"), lt(journalEntries.createdAt, cutoff)));
  if (rows.length === 0) return { removed: 0, failed: 0 };

  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  const removableIds: string[] = [];
  let failed = 0;

  for (const row of rows) {
    const paths = [row.storagePath, row.posterPath].filter((path): path is string => Boolean(path));
    const { error } = await bucket.remove(paths);
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

type JournalTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getLockedJournalUpload(
  tx: JournalTransaction,
  userId: string,
  entryId: string,
) {
  const [row] = await tx
    .select({
      id: journalEntries.id,
      status: journalEntries.status,
      mediaId: journalMedia.id,
      storagePath: journalMedia.storagePath,
      mimeType: journalMedia.mimeType,
      sizeBytes: journalMedia.sizeBytes,
      posterPath: journalMedia.posterPath,
    })
    .from(journalEntries)
    .innerJoin(journalMedia, eq(journalMedia.journalEntryId, journalEntries.id))
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)))
    .for("update", { of: journalEntries })
    .limit(1);
  return row ?? null;
}

async function removeLosingPoster(path: string, originalError?: unknown): Promise<void> {
  const cleanupError = await removeJournalStoragePaths([path]);
  if (!cleanupError) return;
  if (originalError) {
    console.error(
      "Journal poster commit failed before cleanup.",
      originalError instanceof Error ? originalError.message : originalError,
    );
  }
  console.error(
    "Losing journal poster cleanup failed.",
    cleanupError instanceof Error ? cleanupError.message : cleanupError,
  );
  throw new JournalMutationError("An unused journal poster could not be cleaned up. Try again.", 503);
}

async function removeJournalStoragePaths(paths: string[]): Promise<unknown | null> {
  try {
    const { error } = await createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET).remove(paths);
    return error;
  } catch (error) {
    return error;
  }
}

function isStorageNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  return candidate.status === 404 || candidate.statusCode === 404 || candidate.statusCode === "404";
}

function getResumableStorageEndpoint(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  const projectRef = new URL(rawUrl).hostname.split(".")[0];
  if (!projectRef) throw new Error("Supabase project reference could not be determined.");
  // Signed TUS tokens use Supabase's dedicated resumable signing endpoint.
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable/sign`;
}
