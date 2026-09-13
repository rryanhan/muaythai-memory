import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSignedUploadUrl: vi.fn(),
  databaseDelete: vi.fn(),
  getJournalEntryById: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    delete: mocks.databaseDelete,
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: mocks.createSignedUploadUrl,
      }),
    },
  }),
}));

vi.mock("./queries", () => ({
  getJournalEntryById: mocks.getJournalEntryById,
  getOwnedJournalRow: vi.fn(),
}));

import { drills, journalEntries, journalMedia } from "@/db/schema";
import {
  createJournalUploadIntent,
  JournalMutationError,
  updateJournalEntry,
} from "./mutations";

const userId = "71000000-0000-4000-8000-000000000001";
const drillId = "71000000-0000-4000-8000-000000000002";
const entryId = "71000000-0000-4000-8000-000000000003";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.supabase.co";
  mocks.createSignedUploadUrl.mockReset().mockResolvedValue({
    data: { token: "upload-token" },
    error: null,
  });
  mocks.databaseDelete.mockReset();
  mocks.getJournalEntryById.mockReset();
  mocks.transaction.mockReset();
});

describe("journal linked-drill serialization", () => {
  it("locks a create target with FOR KEY SHARE before inserting the journal rows", async () => {
    const events: string[] = [];
    const drillQuery = selectBuilder([{ id: drillId }], "drill", events);
    const tx = {
      insert: vi.fn((table: unknown) => insertBuilder(
        table === journalEntries ? "entry" : table === journalMedia ? "media" : "unknown",
        events,
      )),
      select: vi.fn().mockReturnValue(drillQuery),
    };
    mocks.transaction.mockImplementation(async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => {
      events.push("transaction:start");
      const result = await callback(tx);
      events.push("transaction:end");
      return result;
    });
    mocks.createSignedUploadUrl.mockImplementation(async () => {
      events.push("storage:signed-url");
      return { data: { token: "upload-token" }, error: null };
    });

    await expect(createJournalUploadIntent(userId, {
      fileName: "sparring.mp4",
      mimeType: "video/mp4",
      sizeBytes: 10,
      occurredOn: "2026-09-13",
      drillId,
    })).resolves.toMatchObject({ upload: { token: "upload-token" } });

    expect(drillQuery.for).toHaveBeenCalledWith("key share", { of: drills });
    expect(events).toEqual([
      "transaction:start",
      "select:drill",
      "for:drill:key share",
      "execute:drill",
      "insert:entry",
      "insert:media",
      "transaction:end",
      "storage:signed-url",
    ]);
  });

  it("checks edit state without a row lock, then locks the target before updating", async () => {
    const events: string[] = [];
    const stateQuery = selectBuilder([{ status: "ready" }], "entry-state", events);
    const drillQuery = selectBuilder([{ id: drillId }], "drill", events);
    const updateQuery = updateBuilder([{ id: entryId }], events);
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(stateQuery)
        .mockReturnValueOnce(drillQuery),
      update: vi.fn(() => {
        events.push("update:entry");
        return updateQuery;
      }),
    };
    mocks.transaction.mockImplementation(async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => {
      events.push("transaction:start");
      const result = await callback(tx);
      events.push("transaction:end");
      return result;
    });
    const detail = { id: entryId };
    mocks.getJournalEntryById.mockImplementation(async () => {
      events.push("hydrate");
      return detail;
    });

    await expect(updateJournalEntry(userId, entryId, {
      occurredOn: "2026-09-12",
      caption: "Hard rounds",
      drillId,
    })).resolves.toBe(detail);

    expect(stateQuery.for).not.toHaveBeenCalled();
    expect(stateQuery.innerJoin).toHaveBeenCalledOnce();
    expect(stateQuery.innerJoin.mock.calls[0][0]).toBe(journalMedia);
    expect(drillQuery.for).toHaveBeenCalledWith("key share", { of: drills });
    const compiledWhere = new PgDialect().sqlToQuery(updateQuery.where.mock.calls[0][0]);
    expect(compiledWhere.sql).toContain(
      `"journal_entries"."id" = $1 and "journal_entries"."user_id" = $2 `
        + `and "journal_entries"."status" = $3`,
    );
    expect(compiledWhere.params).toEqual([entryId, userId, "ready"]);
    expect(events).toEqual([
      "transaction:start",
      "select:entry-state",
      "execute:entry-state",
      "select:drill",
      "for:drill:key share",
      "execute:drill",
      "update:entry",
      "update:set",
      "update:where",
      "update:returning",
      "transaction:end",
      "hydrate",
    ]);
  });

  it("preserves the journal not-found error before checking the linked drill", async () => {
    const events: string[] = [];
    const stateQuery = selectBuilder([], "entry-state", events);
    const tx = {
      select: vi.fn().mockReturnValue(stateQuery),
      update: vi.fn(),
    };
    mocks.transaction.mockImplementation(async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx));

    const error = await updateJournalEntry(userId, entryId, {
      occurredOn: "2026-09-12",
      caption: null,
      drillId,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(JournalMutationError);
    expect(error).toMatchObject({ message: "Journal entry not found.", status: 404 });
    expect(tx.select).toHaveBeenCalledOnce();
    expect(tx.update).not.toHaveBeenCalled();
    expect(mocks.getJournalEntryById).not.toHaveBeenCalled();
  });
});

function selectBuilder(rows: unknown[], label: string, events: string[]) {
  const builder = {
    for: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn(),
    where: vi.fn(),
  };
  builder.from.mockImplementation(() => {
    events.push(`select:${label}`);
    return builder;
  });
  builder.where.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  builder.for.mockImplementation((_strength: string) => {
    events.push(`for:${label}:${_strength}`);
    return builder;
  });
  builder.limit.mockImplementation(async () => {
    events.push(`execute:${label}`);
    return rows;
  });
  return builder;
}

function insertBuilder(label: string, events: string[]) {
  return {
    values: vi.fn(async () => {
      events.push(`insert:${label}`);
    }),
  };
}

function updateBuilder(rows: unknown[], events: string[]) {
  const builder = {
    returning: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
  };
  builder.set.mockImplementation(() => {
    events.push("update:set");
    return builder;
  });
  builder.where.mockImplementation(() => {
    events.push("update:where");
    return builder;
  });
  builder.returning.mockImplementation(async () => {
    events.push("update:returning");
    return rows;
  });
  return builder;
}
