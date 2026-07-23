import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
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
import { createJournalPosterObjectPath, uploadJournalPosterObject } from "./poster";
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
    const posterCleanupError = await reconcileJournalPosterObjects(
      bucket,
      userId,
      entryId,
      current.posterPath,
    );
    if (posterCleanupError) {
      logStorageCleanupError("Journal poster reconciliation failed.", posterCleanupError);
      throw new JournalMutationError("Journal poster cleanup could not be completed. Try again.", 503);
    }
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
  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  const posterPath = createJournalPosterObjectPath(userId, entryId, file.type);
  let uploadAttempted = false;
  let outcome:
    | { kind: "saved"; posterPath: string; previousPosterPath: string | null }
    | { kind: "missing" | "not-uploading" };
  try {
    outcome = await db.transaction(async (tx) => {
      const current = await getLockedJournalUpload(tx, userId, entryId);
      if (!current) return { kind: "missing" } as const;
      const posterCleanupError = await reconcileJournalPosterObjects(
        bucket,
        userId,
        entryId,
        current.posterPath,
      );
      if (posterCleanupError) {
        logStorageCleanupError("Journal poster reconciliation failed.", posterCleanupError);
        throw new JournalMutationError("Journal poster cleanup could not be completed. Try again.", 503);
      }
      if (current.status !== "uploading") return { kind: "not-uploading" } as const;

      uploadAttempted = true;
      await uploadJournalPosterObject(userId, entryId, file, posterPath);
      const [updated] = await tx
        .update(journalMedia)
        .set({ posterPath, updatedAt: new Date() })
        .where(and(eq(journalMedia.id, current.mediaId), eq(journalMedia.journalEntryId, entryId)))
        .returning({ id: journalMedia.id });
      if (!updated) throw new JournalMutationError("Journal entry not found.", 404);
      return { kind: "saved", posterPath, previousPosterPath: current.posterPath } as const;
    });
  } catch (error) {
    if (uploadAttempted) {
      const cleanupError = await cleanupFailedPosterAttempt(
        bucket,
        userId,
        entryId,
        posterPath,
      );
      if (cleanupError) {
        logStorageCleanupError("Journal poster commit failed before cleanup.", error);
        logStorageCleanupError("Losing journal poster cleanup failed.", cleanupError);
        throw new JournalMutationError(
          "An unused journal poster could not be cleaned up. Retry to reconcile it.",
          503,
        );
      }
    }
    throw error;
  }

  if (outcome.kind !== "saved") {
    if (outcome.kind === "missing") throw new JournalMutationError("Journal entry not found.", 404);
    throw new JournalMutationError("Journal poster can only be added while the video is uploading.", 409);
  }

  if (outcome.previousPosterPath && outcome.previousPosterPath !== outcome.posterPath) {
    const cleanupError = await removeStoragePaths(bucket, [outcome.previousPosterPath]);
    if (cleanupError) {
      logStorageCleanupError("Previous journal poster cleanup failed.", cleanupError);
      throw new JournalMutationError(
        "The journal poster was saved, but previous poster cleanup is pending. Retry to reconcile it.",
        503,
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
  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  return db.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (!current) throw new JournalMutationError("Journal entry not found.", 404);

    const cleanupError = await removeJournalEntryStorageObjects(
      bucket,
      userId,
      entryId,
      [current.storagePath, current.posterPath].filter((path): path is string => Boolean(path)),
    );
    if (cleanupError) {
      logStorageCleanupError("Journal entry Storage cleanup failed.", cleanupError);
      throw new JournalMutationError("Journal video could not be removed. Try again.", 503);
    }

    const [deleted] = await tx
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)))
      .returning({ id: journalEntries.id });
    if (!deleted) throw new JournalMutationError("Journal entry not found.", 404);
    return deleted.id;
  });
}

export async function cleanupAbandonedJournalUploads(now = new Date()): Promise<{ removed: number; failed: number }> {
  const cutoff = new Date(now.getTime() - JOURNAL_ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: journalEntries.id,
      userId: journalEntries.userId,
      storagePath: journalMedia.storagePath,
      posterPath: journalMedia.posterPath,
    })
    .from(journalEntries)
    .innerJoin(journalMedia, eq(journalMedia.journalEntryId, journalEntries.id))
    .where(and(eq(journalEntries.status, "uploading"), lt(journalEntries.createdAt, cutoff)));
  if (rows.length === 0) return { removed: 0, failed: 0 };

  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  let removed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await db.transaction(async (tx) => {
        const current = await getLockedJournalUpload(tx, row.userId, row.id);
        if (!current || current.status !== "uploading") return false;
        const cleanupError = await removeJournalEntryStorageObjects(
          bucket,
          row.userId,
          row.id,
          [current.storagePath, current.posterPath].filter((path): path is string => Boolean(path)),
        );
        if (cleanupError) {
          logStorageCleanupError("Abandoned journal upload Storage cleanup failed.", cleanupError);
          throw cleanupError;
        }
        const [deleted] = await tx
          .delete(journalEntries)
          .where(and(eq(journalEntries.id, row.id), eq(journalEntries.userId, row.userId)))
          .returning({ id: journalEntries.id });
        if (!deleted) throw new Error("Abandoned journal upload record was not deleted.");
        return true;
      });
      if (result) removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
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
type JournalStorageBucket = ReturnType<
  ReturnType<typeof createSupabaseAdminClient>["storage"]["from"]
>;

const JOURNAL_POSTER_OBJECT_NAME =
  /^poster-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|webp)$/i;

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

async function cleanupFailedPosterAttempt(
  bucket: JournalStorageBucket,
  userId: string,
  entryId: string,
  failedPosterPath: string,
): Promise<unknown | null> {
  try {
    return await db.transaction(async (tx) => {
      const current = await getLockedJournalUpload(tx, userId, entryId);
      if (!current) return removeStoragePaths(bucket, [failedPosterPath]);
      return reconcileJournalPosterObjects(
        bucket,
        userId,
        entryId,
        current.posterPath,
        [failedPosterPath],
      );
    });
  } catch (error) {
    return error;
  }
}

async function reconcileJournalPosterObjects(
  bucket: JournalStorageBucket,
  userId: string,
  entryId: string,
  keepPath: string | null,
  knownPaths: string[] = [],
): Promise<unknown | null> {
  const prefix = journalEntryStoragePrefix(userId, entryId);
  const paths = new Set<string>();
  for (const path of knownPaths) {
    if (path !== keepPath && isJournalPosterPath(path, prefix)) paths.add(path);
  }

  const listing = await listJournalEntryStorageObjects(bucket, prefix);
  for (const path of listing.paths) {
    if (path !== keepPath && isJournalPosterPath(path, prefix)) paths.add(path);
  }

  const removalError = await removeStoragePaths(bucket, [...paths]);
  return removalError ?? listing.error;
}

async function removeJournalEntryStorageObjects(
  bucket: JournalStorageBucket,
  userId: string,
  entryId: string,
  knownPaths: string[],
): Promise<unknown | null> {
  const prefix = journalEntryStoragePrefix(userId, entryId);
  const paths = new Set<string>();
  for (const path of knownPaths) {
    if (isDirectChildPath(path, prefix)) paths.add(path);
  }

  const listing = await listJournalEntryStorageObjects(bucket, prefix);
  for (const path of listing.paths) paths.add(path);
  const removalError = await removeStoragePaths(bucket, [...paths]);
  return removalError ?? listing.error;
}

async function listJournalEntryStorageObjects(
  bucket: JournalStorageBucket,
  prefix: string,
): Promise<{ paths: string[]; error: unknown | null }> {
  const paths: string[] = [];
  let offset = 0;
  try {
    while (true) {
      const { data, error } = await bucket.list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) return { paths, error };

      for (const object of data ?? []) {
        const path = `${prefix}/${object.name}`;
        if (isDirectChildPath(path, prefix)) paths.push(path);
      }
      if (!data || data.length < 100) return { paths, error: null };
      offset += data.length;
    }
  } catch (error) {
    return { paths, error };
  }
}

async function removeStoragePaths(
  bucket: JournalStorageBucket,
  paths: string[],
): Promise<unknown | null> {
  for (let index = 0; index < paths.length; index += 100) {
    try {
      const { error } = await bucket.remove(paths.slice(index, index + 100));
      if (error && !isStorageNotFoundError(error)) return error;
    } catch (error) {
      if (!isStorageNotFoundError(error)) return error;
    }
  }
  return null;
}

function journalEntryStoragePrefix(userId: string, entryId: string): string {
  return `${userId}/${entryId}`;
}

function isDirectChildPath(path: string, prefix: string): boolean {
  if (!path.startsWith(`${prefix}/`)) return false;
  const name = path.slice(prefix.length + 1);
  return name.length > 0 && !name.includes("/") && name !== "." && name !== "..";
}

function isJournalPosterPath(path: string, prefix: string): boolean {
  return isDirectChildPath(path, prefix)
    && JOURNAL_POSTER_OBJECT_NAME.test(path.slice(prefix.length + 1));
}

function logStorageCleanupError(message: string, error: unknown): void {
  console.error(message, error instanceof Error ? error.message : error);
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
