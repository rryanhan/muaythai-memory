import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JOURNAL_PLAYBACK_URL_SECONDS } from "./constants";

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  execute: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: { execute: mocks.execute, select: mocks.select },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import {
  decodeJournalCursor,
  encodeJournalCursor,
  getJournalEntryById,
  getJournalPreviewForDrill,
  JournalCursorError,
  listJournalEntries,
} from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";
const drillId = "22222222-2222-4222-8222-222222222222";
const entryId = "33333333-3333-4333-8333-333333333333";

describe("journal cursors", () => {
  it("round-trips the canonical encoded cursor", () => {
    const cursor = {
      occurredOn: "2026-08-10",
      createdAt: "2026-08-10T12:00:00.123456Z",
      id: entryId,
    };

    expect(decodeJournalCursor(encodeJournalCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ["an impossible calendar date", {
      occurredOn: "2026-99-99",
      createdAt: "2026-08-10T12:00:00.000Z",
      id: entryId,
    }],
    ["a non-UUID identifier", {
      occurredOn: "2026-08-10",
      createdAt: "2026-08-10T12:00:00.000Z",
      id: "------------------------------------",
    }],
    ["a non-ISO timestamp", {
      occurredOn: "2026-08-10",
      createdAt: "Thu, 10 Sep 2026 00:00:00 GMT",
      id: entryId,
    }],
    ["a year-zero date", {
      occurredOn: "0000-01-01",
      createdAt: "2026-08-10T12:00:00.000Z",
      id: entryId,
    }],
    ["a year-zero timestamp", {
      occurredOn: "2026-08-10",
      createdAt: "0000-01-01T00:00:00.000Z",
      id: entryId,
    }],
  ])("rejects %s before it reaches PostgreSQL", (_label, payload) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

    expect(() => decodeJournalCursor(encoded)).toThrow(JournalCursorError);
  });

  it("binds the full-precision timestamp directly in both keyset branches", async () => {
    const createdAtCursor = "2026-08-10T12:00:00.123456Z";
    const cursor = encodeJournalCursor({
      occurredOn: "2026-08-10",
      createdAt: createdAtCursor,
      id: entryId,
    });
    let whereCondition: SQL | undefined;
    const chain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };
    chain.from.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
    chain.leftJoin.mockReturnValue(chain);
    chain.where.mockImplementation((condition: SQL) => {
      whereCondition = condition;
      return chain;
    });
    chain.orderBy.mockReturnValue(chain);
    chain.limit.mockResolvedValue([{
      id: entryId,
      occurredOn: "2026-08-09",
      caption: null,
      createdAt: new Date("2026-08-09T12:00:00.123Z"),
      createdAtCursor: "2026-08-09T12:00:00.123456Z",
      drillId: null,
      drillTitle: null,
      durationMs: null,
      mimeType: "video/mp4",
      posterPath: null,
    }]);
    mocks.select.mockReturnValueOnce(chain);

    await listJournalEntries(userId, { cursor, drillId });

    expect(whereCondition).toBeDefined();
    const compiled = new PgDialect().sqlToQuery(sql`select 1 where ${whereCondition!}`);
    expect(compiled.sql).toMatch(
      /"journal_entries"\."created_at" < \$\d+::timestamptz/,
    );
    expect(compiled.sql).toMatch(
      /"journal_entries"\."created_at" = \$\d+::timestamptz/,
    );
    expect(compiled.params.filter((value) => value === createdAtCursor)).toHaveLength(2);
    expect(compiled.params.some((value) => value instanceof Date)).toBe(false);
  });
});

describe("getJournalPreviewForDrill", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.createSignedUrl.mockReset();
    mocks.from.mockReset().mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.createSupabaseAdminClient.mockReset().mockReturnValue({
      storage: { from: mocks.from },
    });
  });

  it("returns undefined for a drill the user does not own without signing", async () => {
    mocks.execute.mockResolvedValueOnce([]);

    await expect(getJournalPreviewForDrill(userId, drillId)).resolves.toBeUndefined();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns an empty owned preview without signing", async () => {
    mocks.execute.mockResolvedValueOnce([emptySnapshot(0)]);

    await expect(getJournalPreviewForDrill(userId, drillId)).resolves.toEqual({
      entry: null,
      total: 0,
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("loads ownership, total, and latest media-backed entry in one statement", async () => {
    const createdAt = new Date("2026-08-10T12:00:00.000Z");
    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain(
        `with owned_drill as ( select "drills"."id" as "id", "drills"."user_id" as "userId" ` +
          `from "drills" where "drills"."id" = $1 and "drills"."user_id" = $2 limit 1 )`,
      );
      expect(normalizedSql).toContain(
        `select count(*)::integer as "total" from "journal_entries" ` +
          `where "journal_entries"."user_id" = owned_drill."userId" ` +
          `and "journal_entries"."drill_id" = owned_drill."id" ` +
          `and "journal_entries"."status" = 'ready'`,
      );
      expect(normalizedSql).toContain(
        `from "journal_entries" inner join "journal_media" ` +
          `on "journal_media"."journal_entry_id" = "journal_entries"."id"`,
      );
      expect(normalizedSql).toContain(
        `"journal_entries"."occurred_on"::text as "occurredOn"`,
      );
      expect(normalizedSql).toContain(
        `order by "journal_entries"."occurred_on" desc, ` +
          `"journal_entries"."created_at" desc, "journal_entries"."id" desc limit 1`,
      );
      expect(compiled.params).toEqual([drillId, userId]);
      return [readySnapshot({ createdAt, total: 2 })];
    });
    mocks.createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://storage.test/playback" },
      error: null,
    });

    const preview = await getJournalPreviewForDrill(userId, drillId);

    expect(preview).toEqual({
      entry: {
        id: entryId,
        occurredOn: "2026-08-10",
        caption: "Latest round",
        drill: { id: drillId, title: "Teep timing" },
        durationMs: 42_000,
        mimeType: "video/mp4",
        posterUrl: null,
        createdAt,
        playbackUrl: "https://storage.test/playback",
      },
      total: 2,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      `${userId}/${entryId}/clip.mp4`,
      JOURNAL_PLAYBACK_URL_SECONDS,
    );
  });

  it("keeps the total independent of media-backed latest-row selection", async () => {
    const mediaBackedCreatedAt = new Date("2026-08-09T12:00:00.000Z");
    mocks.execute.mockResolvedValueOnce([
      readySnapshot({
        createdAt: mediaBackedCreatedAt,
        occurredOn: "2026-08-09",
        total: 2,
      }),
    ]);
    mocks.createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://storage.test/older-media-backed-entry" },
      error: null,
    });

    const preview = await getJournalPreviewForDrill(userId, drillId);

    expect(preview?.total).toBe(2);
    expect(preview?.entry?.occurredOn).toBe("2026-08-09");
    expect(preview?.entry?.createdAt).toEqual(mediaBackedCreatedAt);
  });

  it("signs playback and poster URLs concurrently while keeping poster failure best-effort", async () => {
    const posterPath = `${userId}/${entryId}/poster.webp`;
    mocks.execute.mockResolvedValueOnce([
      readySnapshot({
        createdAt: new Date("2026-08-10T12:00:00.000Z"),
        posterPath,
        total: 1,
      }),
    ]);
    const playbackSigning = deferred<{
      data: { signedUrl: string };
      error: null;
    }>();
    const posterSigning = deferred<{
      data: null;
      error: { message: string };
    }>();
    mocks.createSignedUrl.mockImplementation((path: string) => (
      path === posterPath ? posterSigning.promise : playbackSigning.promise
    ));

    const preview = getJournalPreviewForDrill(userId, drillId);
    await vi.waitFor(() => expect(mocks.createSignedUrl).toHaveBeenCalledTimes(2));

    posterSigning.resolve({ data: null, error: { message: "Poster signing failed." } });
    playbackSigning.resolve({
      data: { signedUrl: "https://storage.test/playback" },
      error: null,
    });

    await expect(preview).resolves.toMatchObject({
      entry: {
        playbackUrl: "https://storage.test/playback",
        posterUrl: null,
      },
    });
  });

  it("rejects the preview when required playback signing fails", async () => {
    const posterPath = `${userId}/${entryId}/poster.webp`;
    mocks.execute.mockResolvedValueOnce([
      readySnapshot({
        createdAt: new Date("2026-08-10T12:00:00.000Z"),
        posterPath,
        total: 1,
      }),
    ]);
    mocks.createSignedUrl
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Playback signing failed." },
      })
      .mockResolvedValueOnce({
        data: { signedUrl: "https://storage.test/poster" },
        error: null,
      });

    await expect(getJournalPreviewForDrill(userId, drillId))
      .rejects.toThrow("Journal playback URL failed: Playback signing failed.");
  });
});

describe("getJournalEntryById", () => {
  beforeEach(() => {
    mocks.createSignedUrl.mockReset();
    mocks.from.mockReset().mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.createSupabaseAdminClient.mockReset().mockReturnValue({
      storage: { from: mocks.from },
    });
    mocks.select.mockReset();
  });

  it("starts detail playback and poster signing before either request settles", async () => {
    const posterPath = `${userId}/${entryId}/poster.webp`;
    const query = chainBuilder();
    query.limit.mockResolvedValueOnce([ownedReadyRow(posterPath)]);
    mocks.select.mockReturnValueOnce(query);
    const playbackSigning = deferred<{
      data: { signedUrl: string };
      error: null;
    }>();
    const posterSigning = deferred<{
      data: { signedUrl: string };
      error: null;
    }>();
    mocks.createSignedUrl.mockImplementation((path: string) => (
      path === posterPath ? posterSigning.promise : playbackSigning.promise
    ));

    const detail = getJournalEntryById(userId, entryId);
    await vi.waitFor(() => expect(mocks.createSignedUrl).toHaveBeenCalledTimes(2));

    posterSigning.resolve({
      data: { signedUrl: "https://storage.test/poster" },
      error: null,
    });
    playbackSigning.resolve({
      data: { signedUrl: "https://storage.test/playback" },
      error: null,
    });

    await expect(detail).resolves.toMatchObject({
      playbackUrl: "https://storage.test/playback",
      posterUrl: "https://storage.test/poster",
    });
  });
});

function emptySnapshot(total: number) {
  return {
    total,
    id: null,
    occurredOn: null,
    caption: null,
    createdAt: null,
    drillId: null,
    drillTitle: null,
    durationMs: null,
    mimeType: null,
    storagePath: null,
    posterPath: null,
  };
}

function readySnapshot({
  createdAt,
  occurredOn = "2026-08-10",
  posterPath = null,
  total,
}: {
  createdAt: Date;
  occurredOn?: string;
  posterPath?: string | null;
  total: number;
}) {
  return {
    total,
    id: entryId,
    occurredOn,
    caption: "Latest round",
    createdAt,
    drillId,
    drillTitle: "Teep timing",
    durationMs: 42_000,
    mimeType: "video/mp4",
    storagePath: `${userId}/${entryId}/clip.mp4`,
    posterPath,
  };
}

function ownedReadyRow(posterPath: string | null) {
  return {
    ...readySnapshot({
      createdAt: new Date("2026-08-10T12:00:00.000Z"),
      posterPath,
      total: 1,
    }),
    mediaId: "44444444-4444-4444-8444-444444444444",
    sizeBytes: 10,
    status: "ready",
    userId,
  };
}

function chainBuilder() {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
