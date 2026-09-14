import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type {
  JournalPosterBackfillRow,
  JournalPosterBackfillRuntime,
} from "./backfill-journal-posters";

type DatabaseClientModule = typeof import("@/db/client");

type JournalPosterBackfillRuntimeLoaderDependencies = {
  loadDatabaseClient?: () => Promise<DatabaseClientModule>;
  initializeRuntime?: (
    databaseClient: DatabaseClientModule,
  ) => Promise<JournalPosterBackfillRuntime>;
};

const JOURNAL_VIDEO_DOWNLOAD_TIMEOUT_MILLISECONDS = 2 * 60 * 1000;
const JOURNAL_VIDEO_OBJECT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:mov|mp4|webm)$/i;

export async function loadJournalPosterBackfillRuntime({
  loadDatabaseClient = () => import("@/db/client"),
  initializeRuntime = initializeJournalPosterBackfillRuntime,
}: JournalPosterBackfillRuntimeLoaderDependencies = {}): Promise<JournalPosterBackfillRuntime> {
  const databaseClient = await loadDatabaseClient();
  try {
    return await initializeRuntime(databaseClient);
  } catch (error) {
    try {
      await databaseClient.postgresClient.end();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "Journal poster backfill runtime initialization and database cleanup both failed.",
      );
    }
    throw error;
  }
}

async function initializeJournalPosterBackfillRuntime(
  databaseClient: DatabaseClientModule,
): Promise<JournalPosterBackfillRuntime> {
  // All environment-bound modules load only after the selected target passes
  // maintenance validation and replaces ambient target credentials.
  const [drizzle, schema, supabase, journalConstants, journalPoster] =
    await Promise.all([
      import("drizzle-orm"),
      import("@/db/schema"),
      import("@/lib/supabase/admin"),
      import("@/modules/journal/constants"),
      import("@/modules/journal/poster"),
    ]);
  const { db, postgresClient } = databaseClient;
  const { and, asc, eq, gt, isNull } = drizzle;
  const { journalEntries, journalMedia } = schema;
  const bucket = supabase
    .createSupabaseAdminClient()
    .storage.from(journalConstants.JOURNAL_MEDIA_BUCKET);

  return {
    listMissingPosters: ({ limit, afterEntryId }) =>
      db
        .select({
          entryId: journalEntries.id,
          mediaId: journalMedia.id,
          userId: journalEntries.userId,
          storagePath: journalMedia.storagePath,
          mimeType: journalMedia.mimeType,
          sizeBytes: journalMedia.sizeBytes,
        })
        .from(journalEntries)
        .innerJoin(
          journalMedia,
          eq(journalMedia.journalEntryId, journalEntries.id),
        )
        .where(
          and(
            eq(journalEntries.status, "ready"),
            isNull(journalEntries.mediaOperation),
            isNull(journalMedia.posterPath),
            afterEntryId ? gt(journalEntries.id, afterEntryId) : undefined,
          ),
        )
        .orderBy(asc(journalEntries.id))
        .limit(limit),
    writeVideoToFile: async (row, destinationPath) => {
      assertValidJournalVideoRow(row, journalConstants);
      const info = await bucket.info(row.storagePath);
      if (info.error || !info.data) {
        throw new Error(
          info.error?.message ?? "Video metadata could not be loaded.",
        );
      }
      if (
        info.data.size !== row.sizeBytes
        || info.data.size > journalConstants.JOURNAL_VIDEO_MAX_BYTES
        || info.data.contentType !== row.mimeType
      ) {
        throw new Error(
          "Stored video metadata no longer matches the journal entry.",
        );
      }

      const download = await bucket
        .download(
          row.storagePath,
          {},
          {
            cache: "no-store",
            signal: AbortSignal.timeout(
              JOURNAL_VIDEO_DOWNLOAD_TIMEOUT_MILLISECONDS,
            ),
          },
        )
        .asStream();
      if (download.error || !download.data) {
        throw new Error(
          download.error?.message ?? "Video could not be downloaded.",
        );
      }
      await writeLimitedVideoStream(
        download.data,
        destinationPath,
        row.sizeBytes,
      );
    },
    createPosterPath: (row) =>
      journalPoster.createJournalPosterObjectPath(
        row.userId,
        row.entryId,
        "image/jpeg",
      ),
    uploadPoster: async (_row, poster, posterPath) => {
      const { bytes, mimeType } = await journalPoster.validateJournalPoster(
        poster,
      );
      const { error } = await bucket.upload(posterPath, bytes, {
        cacheControl: "31536000",
        contentType: mimeType,
        upsert: false,
      });
      if (error) {
        throw new journalPoster.JournalPosterError(
          "Journal poster could not be uploaded. Try again.",
          503,
        );
      }
    },
    commitPosterPath: (row, posterPath) =>
      db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            entryId: journalEntries.id,
            userId: journalEntries.userId,
            status: journalEntries.status,
            mediaOperation: journalEntries.mediaOperation,
            mediaId: journalMedia.id,
            storagePath: journalMedia.storagePath,
            posterPath: journalMedia.posterPath,
          })
          .from(journalEntries)
          .innerJoin(
            journalMedia,
            eq(journalMedia.journalEntryId, journalEntries.id),
          )
          .where(
            and(
              eq(journalEntries.id, row.entryId),
              eq(journalEntries.userId, row.userId),
            ),
          )
          .for("update", { of: journalEntries })
          .limit(1);
        if (
          !current
          || current.status !== "ready"
          || current.mediaOperation !== null
          || current.mediaId !== row.mediaId
          || current.storagePath !== row.storagePath
          || current.posterPath !== null
        ) {
          return false;
        }

        const [updated] = await tx
          .update(journalMedia)
          .set({ posterPath, updatedAt: new Date() })
          .where(
            and(
              eq(journalMedia.id, current.mediaId),
              eq(journalMedia.journalEntryId, row.entryId),
              isNull(journalMedia.posterPath),
            ),
          )
          .returning({ id: journalMedia.id });
        return Boolean(updated);
      }),
    readPosterPath: (row) =>
      db.transaction(async (tx) => {
        // A failed commit response may arrive while that transaction is still
        // resolving on the server. Locking the parent first waits behind the
        // commit's parent lock. Under READ COMMITTED, the following statement
        // then receives a fresh snapshot of journal_media.
        const [entry] = await tx
          .select({ id: journalEntries.id })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.id, row.entryId),
              eq(journalEntries.userId, row.userId),
            ),
          )
          .for("update", { of: journalEntries })
          .limit(1);
        if (!entry) return null;

        const [media] = await tx
          .select({ posterPath: journalMedia.posterPath })
          .from(journalMedia)
          .where(
            and(
              eq(journalMedia.id, row.mediaId),
              eq(journalMedia.journalEntryId, entry.id),
            ),
          )
          .limit(1);
        return media?.posterPath ?? null;
      }),
    removePoster: (posterPath) => removeStoragePoster(bucket, posterPath),
    close: () => postgresClient.end(),
  };
}

export type JournalVideoConstants = Pick<
  typeof import("@/modules/journal/constants"),
  | "JOURNAL_VIDEO_MAX_BYTES"
  | "isJournalVideoMime"
  | "journalVideoExtension"
>;

export function assertValidJournalVideoRow(
  row: JournalPosterBackfillRow,
  constants: JournalVideoConstants,
): void {
  if (
    !constants.isJournalVideoMime(row.mimeType)
    || !Number.isSafeInteger(row.sizeBytes)
    || row.sizeBytes < 1
    || row.sizeBytes > constants.JOURNAL_VIDEO_MAX_BYTES
  ) {
    throw new Error("Journal entry has invalid recorded video metadata.");
  }

  const prefix = `${row.userId}/${row.entryId}/`;
  const objectName = row.storagePath.startsWith(prefix)
    ? row.storagePath.slice(prefix.length)
    : "";
  const expectedExtension = constants.journalVideoExtension(row.mimeType);
  if (
    !JOURNAL_VIDEO_OBJECT_NAME.test(objectName)
    || !objectName.toLowerCase().endsWith(`.${expectedExtension}`)
  ) {
    throw new Error(
      "Journal video path does not match its entry, owner, and media type.",
    );
  }
}

export async function writeLimitedVideoStream(
  stream: ReadableStream<Uint8Array>,
  destinationPath: string,
  expectedBytes: number,
): Promise<void> {
  let receivedBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > expectedBytes) {
        callback(
          new Error("Downloaded video exceeded its recorded byte length."),
        );
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(
      stream as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
    ),
    limiter,
    createWriteStream(destinationPath, { flags: "wx" }),
  );
  if (receivedBytes !== expectedBytes) {
    throw new Error("Downloaded video ended before its recorded byte length.");
  }
}

type StoragePosterRemover = {
  remove(paths: string[]): Promise<{ error: unknown }>;
};

export async function removeStoragePoster(
  bucket: StoragePosterRemover,
  posterPath: string,
): Promise<void> {
  try {
    const { error } = await bucket.remove([posterPath]);
    if (error && !isStorageNotFoundError(error)) throw error;
  } catch (error) {
    if (!isStorageNotFoundError(error)) throw error;
  }
}

function isStorageNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  return candidate.status === 404
    || candidate.statusCode === 404
    || candidate.statusCode === "404";
}
