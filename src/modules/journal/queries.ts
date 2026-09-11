import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { drills, journalEntries, journalMedia } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { JOURNAL_MEDIA_BUCKET, JOURNAL_PLAYBACK_URL_SECONDS } from "./constants";
import type {
  JournalEntryDetail,
  JournalEntrySummary,
  JournalListResponse,
  JournalPreviewResponse,
} from "./contracts";

type JournalCursor = {
  occurredOn: string;
  createdAt: Date;
  id: string;
};

type JournalPreviewQueryRow = {
  total: number;
  id: string | null;
  occurredOn: string | null;
  caption: string | null;
  createdAt: Date | null;
  drillId: string | null;
  drillTitle: string | null;
  durationMs: number | null;
  mimeType: string | null;
  storagePath: string | null;
  posterPath: string | null;
};

export class JournalCursorError extends Error {
  readonly status = 400;

  constructor() {
    super("Invalid journal cursor.");
    this.name = "JournalCursorError";
  }
}

export async function listJournalEntries(
  userId: string,
  options: { cursor?: string | null; limit?: number; drillId?: string | null } = {},
): Promise<JournalListResponse> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);
  const cursor = options.cursor ? decodeJournalCursor(options.cursor) : null;
  const cursorCondition = cursor
    ? or(
        lt(journalEntries.occurredOn, cursor.occurredOn),
        and(eq(journalEntries.occurredOn, cursor.occurredOn), lt(journalEntries.createdAt, cursor.createdAt)),
        and(
          eq(journalEntries.occurredOn, cursor.occurredOn),
          eq(journalEntries.createdAt, cursor.createdAt),
          lt(journalEntries.id, cursor.id),
        ),
      )
    : undefined;

  const rows = await db
    .select({
      id: journalEntries.id,
      occurredOn: journalEntries.occurredOn,
      caption: journalEntries.caption,
      createdAt: journalEntries.createdAt,
      drillId: drills.id,
      drillTitle: drills.title,
      durationMs: journalMedia.durationMs,
      mimeType: journalMedia.mimeType,
      posterPath: journalMedia.posterPath,
    })
    .from(journalEntries)
    .innerJoin(journalMedia, eq(journalMedia.journalEntryId, journalEntries.id))
    .leftJoin(drills, eq(journalEntries.drillId, drills.id))
    .where(
      and(
        eq(journalEntries.userId, userId),
        eq(journalEntries.status, "ready"),
        options.drillId ? eq(journalEntries.drillId, options.drillId) : undefined,
        cursorCondition,
      ),
    )
    .orderBy(desc(journalEntries.occurredOn), desc(journalEntries.createdAt), desc(journalEntries.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visibleRows = rows.slice(0, limit);
  const lastRow = visibleRows.at(-1);

  const posterUrls = await signPosterPaths(visibleRows.map((row) => row.posterPath));

  return {
    entries: visibleRows.map((row) => toSummary(row, row.posterPath ? posterUrls.get(row.posterPath) ?? null : null)),
    nextCursor: hasMore && lastRow
      ? encodeJournalCursor({ occurredOn: lastRow.occurredOn, createdAt: lastRow.createdAt, id: lastRow.id })
      : null,
  };
}

export async function getJournalPreviewForDrill(
  userId: string,
  drillId: string,
): Promise<JournalPreviewResponse | undefined> {
  const [snapshot] = await db.execute<JournalPreviewQueryRow>(sql`
    with owned_drill as (
      select ${drills.id} as "id", ${drills.userId} as "userId"
      from ${drills}
      where ${drills.id} = ${drillId}
        and ${drills.userId} = ${userId}
      limit 1
    )
    select
      total_counts."total",
      latest."id",
      latest."occurredOn",
      latest."caption",
      latest."createdAt",
      latest."drillId",
      latest."drillTitle",
      latest."durationMs",
      latest."mimeType",
      latest."storagePath",
      latest."posterPath"
    from owned_drill
    cross join lateral (
      select count(*)::integer as "total"
      from ${journalEntries}
      where ${journalEntries.userId} = owned_drill."userId"
        and ${journalEntries.drillId} = owned_drill."id"
        and ${journalEntries.status} = 'ready'
    ) as total_counts
    left join lateral (
      select
        ${journalEntries.id} as "id",
        ${journalEntries.occurredOn}::text as "occurredOn",
        ${journalEntries.caption} as "caption",
        ${journalEntries.createdAt} as "createdAt",
        ${drills.id} as "drillId",
        ${drills.title} as "drillTitle",
        ${journalMedia.durationMs} as "durationMs",
        ${journalMedia.mimeType} as "mimeType",
        ${journalMedia.storagePath} as "storagePath",
        ${journalMedia.posterPath} as "posterPath"
      from ${journalEntries}
      inner join ${journalMedia}
        on ${journalMedia.journalEntryId} = ${journalEntries.id}
      left join ${drills}
        on ${journalEntries.drillId} = ${drills.id}
      where ${journalEntries.userId} = owned_drill."userId"
        and ${journalEntries.drillId} = owned_drill."id"
        and ${journalEntries.status} = 'ready'
      order by
        ${journalEntries.occurredOn} desc,
        ${journalEntries.createdAt} desc,
        ${journalEntries.id} desc
      limit 1
    ) as latest on true
  `);

  if (!snapshot) return undefined;
  if (!snapshot.id) return { entry: null, total: snapshot.total };
  if (
    !snapshot.occurredOn
    || !snapshot.createdAt
    || !snapshot.mimeType
    || !snapshot.storagePath
  ) {
    throw new Error("Journal preview query returned an incomplete entry.");
  }

  const latest = {
    id: snapshot.id,
    occurredOn: snapshot.occurredOn,
    caption: snapshot.caption,
    createdAt: snapshot.createdAt,
    drillId: snapshot.drillId,
    drillTitle: snapshot.drillTitle,
    durationMs: snapshot.durationMs,
    mimeType: snapshot.mimeType,
    storagePath: snapshot.storagePath,
    posterPath: snapshot.posterPath,
  };

  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  const [{ data, error }, posterUrl] = await Promise.all([
    bucket.createSignedUrl(latest.storagePath, JOURNAL_PLAYBACK_URL_SECONDS),
    signPosterPath(latest.posterPath),
  ]);
  if (error || !data?.signedUrl) {
    throw new Error(`Journal playback URL failed: ${error?.message ?? "No URL returned."}`);
  }

  return {
    entry: {
      ...toSummary(latest, posterUrl),
      playbackUrl: data.signedUrl,
    },
    total: snapshot.total,
  };
}

export async function isOwnedDrill(userId: string, drillId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: drills.id })
    .from(drills)
    .where(and(eq(drills.id, drillId), eq(drills.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function getJournalEntryById(userId: string, id: string): Promise<JournalEntryDetail | null> {
  const row = await getOwnedJournalRow(userId, id, "ready");
  if (!row) return null;

  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  const [{ data, error }, posterUrl] = await Promise.all([
    bucket.createSignedUrl(row.storagePath, JOURNAL_PLAYBACK_URL_SECONDS),
    signPosterPath(row.posterPath),
  ]);
  if (error || !data?.signedUrl) throw new Error(`Journal playback URL failed: ${error?.message ?? "No URL returned."}`);

  return {
    ...toSummary(row, posterUrl),
    playbackUrl: data.signedUrl,
  };
}

export async function getOwnedJournalRow(
  userId: string,
  id: string,
  status?: "uploading" | "ready",
) {
  const [row] = await db
    .select({
      id: journalEntries.id,
      userId: journalEntries.userId,
      occurredOn: journalEntries.occurredOn,
      caption: journalEntries.caption,
      status: journalEntries.status,
      createdAt: journalEntries.createdAt,
      drillId: drills.id,
      drillTitle: drills.title,
      mediaId: journalMedia.id,
      storagePath: journalMedia.storagePath,
      durationMs: journalMedia.durationMs,
      mimeType: journalMedia.mimeType,
      sizeBytes: journalMedia.sizeBytes,
      posterPath: journalMedia.posterPath,
    })
    .from(journalEntries)
    .innerJoin(journalMedia, eq(journalMedia.journalEntryId, journalEntries.id))
    .leftJoin(drills, eq(journalEntries.drillId, drills.id))
    .where(
      and(
        eq(journalEntries.id, id),
        eq(journalEntries.userId, userId),
        status ? eq(journalEntries.status, status) : undefined,
      ),
    )
    .limit(1);

  return row ?? null;
}

function toSummary(row: {
  id: string;
  occurredOn: string;
  caption: string | null;
  createdAt: Date;
  drillId: string | null;
  drillTitle: string | null;
  durationMs: number | null;
  mimeType: string;
}, posterUrl: string | null = null): JournalEntrySummary {
  return {
    id: row.id,
    occurredOn: row.occurredOn,
    caption: row.caption,
    drill: row.drillId && row.drillTitle ? { id: row.drillId, title: row.drillTitle } : null,
    durationMs: row.durationMs,
    mimeType: row.mimeType as JournalEntrySummary["mimeType"],
    posterUrl,
    createdAt: row.createdAt,
  };
}

async function signPosterPaths(paths: Array<string | null>): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (uniquePaths.length === 0) return new Map();

  const { data, error } = await createSupabaseAdminClient().storage
    .from(JOURNAL_MEDIA_BUCKET)
    .createSignedUrls(uniquePaths, JOURNAL_PLAYBACK_URL_SECONDS);
  if (error || !data) return new Map();

  return new Map(
    data
      .filter((entry): entry is typeof entry & { path: string; signedUrl: string } => Boolean(entry.path && entry.signedUrl))
      .map((entry) => [entry.path, entry.signedUrl]),
  );
}

async function signPosterPath(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await createSupabaseAdminClient().storage
    .from(JOURNAL_MEDIA_BUCKET)
    .createSignedUrl(path, JOURNAL_PLAYBACK_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export function encodeJournalCursor(cursor: JournalCursor): string {
  return Buffer.from(JSON.stringify({
    occurredOn: cursor.occurredOn,
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  })).toString("base64url");
}

export function decodeJournalCursor(value: string): JournalCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    const createdAt = new Date(String(parsed.createdAt));
    if (
      typeof parsed.occurredOn !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(parsed.occurredOn) ||
      Number.isNaN(createdAt.valueOf()) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id)
    ) {
      throw new Error("Malformed cursor.");
    }
    return { occurredOn: parsed.occurredOn, createdAt, id: parsed.id };
  } catch {
    throw new JournalCursorError();
  }
}
