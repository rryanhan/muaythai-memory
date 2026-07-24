import { randomUUID } from "node:crypto";
import { and, eq, lt, lte, or } from "drizzle-orm";
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

export async function refreshJournalUploadIntent(
  userId: string,
  entryId: string,
): Promise<JournalUploadIntentResponse> {
  const claim = await claimUploadToken(userId, entryId);

  let token: string;
  try {
    const { data, error } = await createSupabaseAdminClient().storage
      .from(JOURNAL_MEDIA_BUCKET)
      .createSignedUploadUrl(claim.current.storagePath, { upsert: false });
    if (error || !data?.token) throw new Error(error?.message ?? "No upload token returned.");
    token = data.token;
  } catch (error) {
    await releaseOperation(userId, entryId, "token", claim.token);
    throw error;
  }

  let finalized: boolean;
  try {
    finalized = await finalizeUploadToken(userId, entryId, claim.token);
  } catch (error) {
    logStorageCleanupError("Journal upload token database finalize failed.", error);
    throw new JournalMutationError("Journal upload access could not be refreshed. Try again.", 503);
  }
  if (!finalized) {
    throw new JournalMutationError("Journal upload changed while access was being refreshed.", 409);
  }

  return {
    entryId,
    upload: {
      endpoint: getResumableStorageEndpoint(),
      token,
      path: claim.current.storagePath,
    },
  };
}

export async function completeJournalUpload(userId: string, entryId: string): Promise<JournalEntryDetail> {
  const claim = await claimCompletion(userId, entryId);
  if (claim.kind === "ready") return loadCompletedEntry(userId, entryId);

  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  const posterCleanupError = await reconcileJournalPosterObjects(
    bucket,
    userId,
    entryId,
    claim.current.posterPath,
  );
  if (posterCleanupError) {
    logStorageCleanupError("Journal poster reconciliation failed.", posterCleanupError);
    await releaseOperation(userId, entryId, "complete", claim.token);
    throw new JournalMutationError("Journal poster cleanup could not be completed. Try again.", 503);
  }

  let infoResult: Awaited<ReturnType<typeof bucket.info>>;
  try {
    infoResult = await bucket.info(claim.current.storagePath);
  } catch (error) {
    if (isStorageNotFoundError(error)) {
      return rejectCompletedUpload(userId, entryId, claim, bucket, "missing");
    }
    await releaseOperation(userId, entryId, "complete", claim.token);
    throw new JournalMutationError("The uploaded video could not be confirmed. Try again.", 409);
  }

  if (infoResult.error) {
    if (isStorageNotFoundError(infoResult.error)) {
      return rejectCompletedUpload(userId, entryId, claim, bucket, "missing");
    }
    await releaseOperation(userId, entryId, "complete", claim.token);
    throw new JournalMutationError("The uploaded video could not be confirmed. Try again.", 409);
  }
  if (!infoResult.data) {
    await releaseOperation(userId, entryId, "complete", claim.token);
    throw new JournalMutationError("The uploaded video could not be confirmed. Try again.", 409);
  }

  const contentType = infoResult.data.contentType ?? "";
  if (
    infoResult.data.size !== claim.current.sizeBytes
    || !isJournalVideoMime(contentType)
    || contentType !== claim.current.mimeType
  ) {
    return rejectCompletedUpload(userId, entryId, claim, bucket, "mismatch");
  }

  let finalized: boolean;
  try {
    finalized = await finalizeReadyUpload(userId, entryId, claim.token);
  } catch (error) {
    logStorageCleanupError("Journal completion database finalize failed.", error);
    throw new JournalMutationError("Journal entry could not be completed. Try again.", 503);
  }
  if (!finalized) {
    const completed = await getJournalEntryById(userId, entryId);
    if (completed) return completed;
    throw new JournalMutationError("Journal entry could not be completed.", 409);
  }
  return loadCompletedEntry(userId, entryId);
}

export async function saveJournalPoster(userId: string, entryId: string, file: File): Promise<void> {
  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  const posterPath = createJournalPosterObjectPath(userId, entryId, file.type);
  const claim = await claimPosterSave(userId, entryId);

  try {
    await uploadJournalPosterObject(userId, entryId, file, posterPath);
  } catch (error) {
    const cleanupError = await cleanupUncommittedPoster(bucket, userId, entryId, posterPath);
    await releaseOperation(userId, entryId, "poster", claim.token);
    if (cleanupError) {
      logStorageCleanupError("Journal poster upload failed before cleanup.", error);
      logStorageCleanupError("Losing journal poster cleanup failed.", cleanupError);
      throw new JournalMutationError(
        "An unused journal poster could not be cleaned up. Retry to reconcile it.",
        503,
      );
    }
    throw error;
  }

  let finalized: { previousPosterPath: string | null } | null;
  try {
    finalized = await finalizePosterSave(userId, entryId, claim.token, posterPath);
  } catch (error) {
    const cleanupError = await cleanupUncommittedPoster(bucket, userId, entryId, posterPath);
    await releaseOperation(userId, entryId, "poster", claim.token);
    if (cleanupError) {
      logStorageCleanupError("Journal poster commit failed before cleanup.", error);
      logStorageCleanupError("Losing journal poster cleanup failed.", cleanupError);
      throw new JournalMutationError(
        "An unused journal poster could not be cleaned up. Retry to reconcile it.",
        503,
      );
    }
    throw error;
  }

  if (!finalized) {
    const cleanupError = await cleanupUncommittedPoster(bucket, userId, entryId, posterPath);
    if (cleanupError) {
      logStorageCleanupError("Losing journal poster cleanup failed.", cleanupError);
      throw new JournalMutationError(
        "An unused journal poster could not be cleaned up. Retry to reconcile it.",
        503,
      );
    }
    const current = await getOwnedJournalRow(userId, entryId);
    if (!current) throw new JournalMutationError("Journal entry not found.", 404);
    throw new JournalMutationError("Journal poster can only be added while the video is uploading.", 409);
  }

  if (finalized.previousPosterPath && finalized.previousPosterPath !== posterPath) {
    const cleanupError = await removeStoragePaths(bucket, [finalized.previousPosterPath]);
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
  const claim = await claimDeletion(userId, entryId);
  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  const cleanupError = await removeJournalEntryStorageObjects(
    bucket,
    userId,
    entryId,
    [claim.current.storagePath, claim.current.posterPath].filter((path): path is string => Boolean(path)),
  );
  if (cleanupError) {
    logStorageCleanupError("Journal entry Storage cleanup failed.", cleanupError);
    await releaseOperation(userId, entryId, "delete", claim.token);
    throw new JournalMutationError("Journal video could not be removed. Try again.", 503);
  }

  let finalized: boolean;
  try {
    finalized = await finalizeDeletion(userId, entryId, "delete", claim.token);
  } catch (error) {
    logStorageCleanupError("Journal entry database deletion failed.", error);
    throw new JournalMutationError("Journal video was removed, but its entry cleanup must be retried.", 503);
  }
  if (finalized || !(await getOwnedJournalRow(userId, entryId))) return entryId;
  throw new JournalMutationError("Journal entry is already being removed.", 409);
}

export async function cleanupAbandonedJournalUploads(now = new Date()): Promise<{ removed: number; failed: number }> {
  const cutoff = new Date(now.getTime() - JOURNAL_ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000);
  const leaseCutoff = new Date(now.getTime() - JOURNAL_OPERATION_LEASE_MS);
  const rows = await db
    .select({
      id: journalEntries.id,
      userId: journalEntries.userId,
    })
    .from(journalEntries)
    .where(or(
      and(eq(journalEntries.status, "uploading"), lt(journalEntries.createdAt, cutoff)),
      eq(journalEntries.mediaOperation, "cleanup"),
      and(
        eq(journalEntries.mediaOperation, "delete"),
        lte(journalEntries.mediaOperationStartedAt, leaseCutoff),
      ),
    ));
  if (rows.length === 0) return { removed: 0, failed: 0 };

  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  let removed = 0;
  let failed = 0;

  for (const row of rows) {
    const claim = await claimAbandonedCleanup(row.userId, row.id, cutoff, now);
    if (!claim) continue;

    const cleanupError = await removeJournalEntryStorageObjects(
      bucket,
      row.userId,
      row.id,
      [claim.current.storagePath, claim.current.posterPath].filter((path): path is string => Boolean(path)),
    );
    if (cleanupError) {
      logStorageCleanupError("Abandoned journal upload Storage cleanup failed.", cleanupError);
      failed += 1;
      continue;
    }

    try {
      const finalized = await finalizeDeletion(
        row.userId,
        row.id,
        "cleanup",
        claim.token,
        claim.requiredStatus,
      );
      if (finalized) removed += 1;
    } catch (error) {
      logStorageCleanupError("Abandoned journal upload database deletion failed.", error);
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
type JournalDatabase = Pick<typeof db, "transaction">;
type JournalMediaOperation = "token" | "poster" | "complete" | "delete" | "cleanup";
type LockedJournalUpload = NonNullable<Awaited<ReturnType<typeof getLockedJournalUpload>>>;
type OperationClaim = {
  current: LockedJournalUpload;
  token: string;
};

const JOURNAL_OPERATION_LEASE_MS = 5 * 60 * 1000;
const JOURNAL_POSTER_OBJECT_NAME =
  /^poster-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|webp)$/i;

export async function claimPosterSave(
  userId: string,
  entryId: string,
  database: JournalDatabase = db,
): Promise<OperationClaim> {
  return database.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (!current) throw new JournalMutationError("Journal entry not found.", 404);
    if (current.status !== "uploading") {
      throw new JournalMutationError("Journal poster can only be added while the video is uploading.", 409);
    }
    if (current.mediaOperation && current.mediaOperation !== "poster") {
      throw new JournalMutationError("Journal media is already being finalized or removed.", 409);
    }
    return setOperationClaim(tx, current, userId, "poster", new Date());
  });
}

export async function claimCompletion(
  userId: string,
  entryId: string,
  database: JournalDatabase = db,
): Promise<{ kind: "ready" } | ({ kind: "claimed" } & OperationClaim)> {
  return database.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (!current) throw new JournalMutationError("Journal entry not found.", 404);
    if (current.mediaOperation === "delete" || current.mediaOperation === "cleanup") {
      throw new JournalMutationError("Journal entry is being removed.", 409);
    }
    if (current.status === "ready") return { kind: "ready" } as const;
    if (current.status !== "uploading") {
      throw new JournalMutationError("Journal entry could not be completed.", 409);
    }
    if (!current.posterPath) {
      throw new JournalMutationError("Choose a journal cover before completing the upload.", 409);
    }
    const claim = await setOperationClaim(tx, current, userId, "complete", new Date());
    return { kind: "claimed", ...claim } as const;
  });
}

export async function claimDeletion(
  userId: string,
  entryId: string,
  database: JournalDatabase = db,
): Promise<OperationClaim> {
  return database.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (!current) throw new JournalMutationError("Journal entry not found.", 404);
    return setOperationClaim(tx, current, userId, "delete", new Date());
  });
}

async function claimAbandonedCleanup(
  userId: string,
  entryId: string,
  cutoff: Date,
  now: Date,
): Promise<(OperationClaim & { requiredStatus?: "uploading" }) | null> {
  return db.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (!current) return null;
    const leaseCutoff = new Date(now.getTime() - JOURNAL_OPERATION_LEASE_MS);
    const staleDelete = current.mediaOperation === "delete"
      && Boolean(current.mediaOperationStartedAt && current.mediaOperationStartedAt <= leaseCutoff);
    const destructiveCleanup = current.mediaOperation === "cleanup";
    const abandonedUpload = current.status === "uploading" && current.createdAt < cutoff;
    if (!staleDelete && !destructiveCleanup && !abandonedUpload) return null;
    if (current.mediaOperation && current.mediaOperation !== "cleanup") {
      if (!current.mediaOperationStartedAt || current.mediaOperationStartedAt > leaseCutoff) return null;
    }
    const claim = await setOperationClaim(tx, current, userId, "cleanup", now);
    return {
      ...claim,
      requiredStatus: staleDelete || destructiveCleanup ? undefined : "uploading",
    };
  });
}

async function claimUploadToken(
  userId: string,
  entryId: string,
  database: JournalDatabase = db,
): Promise<OperationClaim> {
  return database.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (!current) throw new JournalMutationError("Journal entry not found.", 404);
    if (current.status !== "uploading") {
      throw new JournalMutationError("Journal upload access can only be refreshed while uploading.", 409);
    }
    if (current.mediaOperation && current.mediaOperation !== "token") {
      throw new JournalMutationError("Journal media is already being finalized or removed.", 409);
    }
    return setOperationClaim(tx, current, userId, "token", new Date());
  });
}

async function setOperationClaim(
  tx: JournalTransaction,
  current: LockedJournalUpload,
  userId: string,
  operation: JournalMediaOperation,
  startedAt: Date,
): Promise<OperationClaim> {
  const token = randomUUID();
  const [claimed] = await tx
    .update(journalEntries)
    .set({
      mediaOperation: operation,
      mediaOperationToken: token,
      mediaOperationStartedAt: startedAt,
      updatedAt: startedAt,
    })
    .where(and(eq(journalEntries.id, current.id), eq(journalEntries.userId, userId)))
    .returning({ id: journalEntries.id });
  if (!claimed) throw new JournalMutationError("Journal entry not found.", 404);
  return { current, token };
}

export async function finalizePosterSave(
  userId: string,
  entryId: string,
  token: string,
  posterPath: string,
  database: JournalDatabase = db,
): Promise<{ previousPosterPath: string | null } | null> {
  return database.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (
      !current
      || current.status !== "uploading"
      || !operationMatches(current, "poster", token)
    ) {
      return null;
    }

    const [updatedMedia] = await tx
      .update(journalMedia)
      .set({ posterPath, updatedAt: new Date() })
      .where(and(eq(journalMedia.id, current.mediaId), eq(journalMedia.journalEntryId, entryId)))
      .returning({ id: journalMedia.id });
    if (!updatedMedia) throw new JournalMutationError("Journal entry not found.", 404);
    await clearOperationClaim(tx, current, userId);
    return { previousPosterPath: current.posterPath };
  });
}

export async function finalizeReadyUpload(
  userId: string,
  entryId: string,
  token: string,
  database: JournalDatabase = db,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (
      !current
      || current.status !== "uploading"
      || !operationMatches(current, "complete", token)
    ) {
      return false;
    }
    const [updated] = await tx
      .update(journalEntries)
      .set({
        status: "ready",
        mediaOperation: null,
        mediaOperationToken: null,
        mediaOperationStartedAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(journalEntries.id, entryId),
        eq(journalEntries.userId, userId),
        eq(journalEntries.status, "uploading"),
        eq(journalEntries.mediaOperation, "complete"),
        eq(journalEntries.mediaOperationToken, token),
      ))
      .returning({ id: journalEntries.id });
    return Boolean(updated);
  });
}

export async function finalizeDeletion(
  userId: string,
  entryId: string,
  operation: "delete" | "cleanup" | "complete",
  token: string,
  requiredStatus?: "uploading",
  database: JournalDatabase = db,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (
      !current
      || (requiredStatus && current.status !== requiredStatus)
      || !operationMatches(current, operation, token)
    ) {
      return false;
    }
    const [deleted] = await tx
      .delete(journalEntries)
      .where(and(
        eq(journalEntries.id, entryId),
        eq(journalEntries.userId, userId),
        eq(journalEntries.mediaOperation, operation),
        eq(journalEntries.mediaOperationToken, token),
        requiredStatus ? eq(journalEntries.status, requiredStatus) : undefined,
      ))
      .returning({ id: journalEntries.id });
    return Boolean(deleted);
  });
}

async function finalizeUploadToken(
  userId: string,
  entryId: string,
  token: string,
  database: JournalDatabase = db,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const current = await getLockedJournalUpload(tx, userId, entryId);
    if (
      !current
      || current.status !== "uploading"
      || !operationMatches(current, "token", token)
    ) {
      return false;
    }
    await clearOperationClaim(tx, current, userId);
    return true;
  });
}

async function clearOperationClaim(
  tx: JournalTransaction,
  current: LockedJournalUpload,
  userId: string,
): Promise<void> {
  const [updated] = await tx
    .update(journalEntries)
    .set({
      mediaOperation: null,
      mediaOperationToken: null,
      mediaOperationStartedAt: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(journalEntries.id, current.id),
      eq(journalEntries.userId, userId),
      eq(journalEntries.mediaOperation, current.mediaOperation!),
      eq(journalEntries.mediaOperationToken, current.mediaOperationToken!),
    ))
    .returning({ id: journalEntries.id });
  if (!updated) throw new JournalMutationError("Journal operation ownership was lost.", 409);
}

async function releaseOperation(
  userId: string,
  entryId: string,
  operation: JournalMediaOperation,
  token: string,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const current = await getLockedJournalUpload(tx, userId, entryId);
      if (!current || !operationMatches(current, operation, token)) return;
      await clearOperationClaim(tx, current, userId);
    });
  } catch (error) {
    logStorageCleanupError("Journal operation release failed; retry can take over the claim.", error);
  }
}

function operationMatches(
  current: LockedJournalUpload,
  operation: JournalMediaOperation,
  token: string,
): boolean {
  return current.mediaOperation === operation && current.mediaOperationToken === token;
}

async function rejectCompletedUpload(
  userId: string,
  entryId: string,
  claim: OperationClaim,
  bucket: JournalStorageBucket,
  reason: "missing" | "mismatch",
): Promise<never> {
  const cleanupError = await removeJournalEntryStorageObjects(
    bucket,
    userId,
    entryId,
    [claim.current.storagePath, claim.current.posterPath].filter((path): path is string => Boolean(path)),
  );
  if (cleanupError) {
    logStorageCleanupError("Rejected journal upload Storage cleanup failed.", cleanupError);
    await releaseOperation(userId, entryId, "complete", claim.token);
    throw new JournalMutationError(
      "The uploaded video was rejected, but its files could not be cleaned up. Try again.",
      503,
    );
  }

  let finalized: boolean;
  try {
    finalized = await finalizeDeletion(userId, entryId, "complete", claim.token, "uploading");
  } catch (error) {
    logStorageCleanupError("Rejected journal upload database cleanup failed.", error);
    throw new JournalMutationError(
      "The rejected files were removed, but the upload record remains. Retry to finish cleanup.",
      503,
    );
  }
  if (!finalized && await getOwnedJournalRow(userId, entryId)) {
    throw new JournalMutationError("Journal entry could not be rejected because its operation changed.", 409);
  }

  throw new JournalMutationError(
    reason === "missing"
      ? "The uploaded video is no longer available. Select it again."
      : "The uploaded video did not match the selected file.",
    reason === "missing" ? 409 : 400,
  );
}

async function loadCompletedEntry(userId: string, entryId: string): Promise<JournalEntryDetail> {
  const entry = await getJournalEntryById(userId, entryId);
  if (!entry) throw new JournalMutationError("Completed journal entry could not be loaded.", 404);
  return entry;
}

async function getLockedJournalUpload(
  tx: JournalTransaction,
  userId: string,
  entryId: string,
) {
  const [row] = await tx
    .select({
      id: journalEntries.id,
      status: journalEntries.status,
      createdAt: journalEntries.createdAt,
      mediaOperation: journalEntries.mediaOperation,
      mediaOperationToken: journalEntries.mediaOperationToken,
      mediaOperationStartedAt: journalEntries.mediaOperationStartedAt,
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

async function cleanupUncommittedPoster(
  bucket: JournalStorageBucket,
  userId: string,
  entryId: string,
  posterPath: string,
): Promise<unknown | null> {
  const current = await getOwnedJournalRow(userId, entryId);
  if (current?.posterPath === posterPath) return null;
  return removeStoragePaths(bucket, [posterPath]);
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
