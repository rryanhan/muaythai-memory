import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { drills, journalEntries, journalMedia } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { JOURNAL_MEDIA_BUCKET, JOURNAL_PLAYBACK_URL_SECONDS } from "./constants";
import type { JournalEntryDetail, JournalEntrySummary, JournalListResponse } from "./contracts";

type JournalCursor = {
  occurredOn: string;
  createdAt: Date;
  id: string;
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
  options: { cursor?: string | null; limit?: number } = {},
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
    })
    .from(journalEntries)
    .innerJoin(journalMedia, eq(journalMedia.journalEntryId, journalEntries.id))
    .leftJoin(drills, eq(journalEntries.drillId, drills.id))
    .where(
      and(
        eq(journalEntries.userId, userId),
        eq(journalEntries.status, "ready"),
        cursorCondition,
      ),
    )
    .orderBy(desc(journalEntries.occurredOn), desc(journalEntries.createdAt), desc(journalEntries.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visibleRows = rows.slice(0, limit);
  const lastRow = visibleRows.at(-1);

  return {
    entries: visibleRows.map(toSummary),
    nextCursor: hasMore && lastRow
      ? encodeJournalCursor({ occurredOn: lastRow.occurredOn, createdAt: lastRow.createdAt, id: lastRow.id })
      : null,
  };
}

export async function getJournalEntryById(userId: string, id: string): Promise<JournalEntryDetail | null> {
  const row = await getOwnedJournalRow(userId, id, "ready");
  if (!row) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(JOURNAL_MEDIA_BUCKET)
    .createSignedUrl(row.storagePath, JOURNAL_PLAYBACK_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(`Journal playback URL failed: ${error?.message ?? "No URL returned."}`);

  return {
    ...toSummary(row),
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
}): JournalEntrySummary {
  return {
    id: row.id,
    occurredOn: row.occurredOn,
    caption: row.caption,
    drill: row.drillId && row.drillTitle ? { id: row.drillId, title: row.drillTitle } : null,
    durationMs: row.durationMs,
    mimeType: row.mimeType as JournalEntrySummary["mimeType"],
    createdAt: row.createdAt,
  };
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
