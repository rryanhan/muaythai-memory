import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import {
  assertLoopbackPostgresTestDatabase,
  resolvePostgresTestDatabaseUrl,
} from "@/test-support/postgres-test-database";

const databaseUrl = resolvePostgresTestDatabaseUrl();
const describePostgres = databaseUrl ? describe : describe.skip;

const ownerId = "79000000-0000-4000-8000-000000000001";
const drillId = "79000000-0000-4000-8000-000000000002";
const entryId = "79000000-0000-4000-8000-000000000003";
const mediaId = "79000000-0000-4000-8000-000000000004";
const mutationApplicationName = "journal_linked_drill_mutation";

let fixtureConnection: Sql;
let observerConnection: Sql;
let mutationConnection: Sql;
let mutations: typeof import("./mutations");

describePostgres("journal linked-drill serialization with PostgreSQL", () => {
  beforeAll(async () => {
    assertLoopbackPostgresTestDatabase(databaseUrl!);
    fixtureConnection = postgres(databaseUrl!, {
      max: 1,
      prepare: false,
      connection: { application_name: "journal_linked_drill_fixture" },
    });
    observerConnection = postgres(databaseUrl!, {
      max: 1,
      prepare: false,
      connection: { application_name: "journal_linked_drill_observer" },
    });
    mutationConnection = postgres(databaseUrl!, {
      max: 1,
      prepare: false,
      connection: { application_name: mutationApplicationName },
    });
    const mutationDatabase = drizzle(mutationConnection, { schema });
    vi.doMock("@/db/client", () => ({ db: mutationDatabase }));
    mutations = await import("./mutations");
  });

  beforeEach(async () => {
    await resetFixture(fixtureConnection);
  });

  afterAll(async () => {
    if (!fixtureConnection) return;
    await clearFixture(fixtureConnection);
    vi.doUnmock("@/db/client");
    await Promise.all([
      fixtureConnection.end(),
      observerConnection.end(),
      mutationConnection.end(),
    ]);
  });

  it("returns the linked-drill 404 when delete wins a journal create race", async () => {
    const { blockedQuery, outcome } = await raceWithCommittedDrillDelete(
      fixtureConnection,
      observerConnection,
      () => mutations.createJournalUploadIntent(ownerId, {
        fileName: "race.mp4",
        mimeType: "video/mp4",
        sizeBytes: 10,
        occurredOn: "2026-09-13",
        caption: "Create race entry",
        drillId,
      }),
    );

    expect(normalizeSql(blockedQuery)).toMatch(
      /select .* from "drills" .* for key share of "drills"/,
    );
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") {
      throw new Error("Journal creation unexpectedly survived a committed drill deletion.");
    }
    expect(outcome.reason).toBeInstanceOf(mutations.JournalMutationError);
    expect(outcome.reason).toMatchObject({
      message: "Linked drill not found.",
      status: 404,
    });

    const [created] = await fixtureConnection<{ count: number }[]>`
      select count(*)::integer as count
      from journal_entries
      where user_id = ${ownerId}
        and caption = 'Create race entry'
    `;
    expect(created?.count).toBe(0);
  });

  it("returns the linked-drill 404 without changing metadata when delete wins an update race", async () => {
    const { blockedQuery, outcome } = await raceWithCommittedDrillDelete(
      fixtureConnection,
      observerConnection,
      () => mutations.updateJournalEntry(ownerId, entryId, {
        occurredOn: "2026-09-13",
        caption: "Updated caption",
        drillId,
      }),
    );

    expect(normalizeSql(blockedQuery)).toMatch(
      /select .* from "drills" .* for key share of "drills"/,
    );
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") {
      throw new Error("Journal update unexpectedly survived a committed drill deletion.");
    }
    expect(outcome.reason).toBeInstanceOf(mutations.JournalMutationError);
    expect(outcome.reason).toMatchObject({
      message: "Linked drill not found.",
      status: 404,
    });

    const [entry] = await fixtureConnection<{
      caption: string | null;
      drillId: string | null;
      occurredOn: string;
    }[]>`
      select
        caption,
        drill_id as "drillId",
        occurred_on::text as "occurredOn"
      from journal_entries
      where id = ${entryId}
    `;
    expect(entry).toEqual({
      caption: "Original caption",
      drillId: null,
      occurredOn: "2026-09-01",
    });
  });
});

async function raceWithCommittedDrillDelete(
  fixtureSql: Sql,
  observerSql: Sql,
  mutate: () => Promise<unknown>,
): Promise<{
  blockedQuery: string;
  outcome:
    | { status: "fulfilled"; value: unknown }
    | { status: "rejected"; reason: unknown };
}> {
  const deletionStarted = deferred<void>();
  const deletionRelease = deferred<void>();
  const deletion = fixtureSql.begin(async (tx) => {
    await tx`delete from drills where id = ${drillId}`;
    deletionStarted.resolve();
    await deletionRelease.promise;
  });
  void deletion.catch((error: unknown) => deletionStarted.reject(error));
  await deletionStarted.promise;

  const outcomePromise = mutate().then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );

  const observation = await waitForLockWait(observerSql, mutationApplicationName).then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );
  deletionRelease.resolve();
  const [deletionOutcome, outcome] = await Promise.all([
    deletion.then(
      () => ({ status: "fulfilled" as const }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    ),
    outcomePromise,
  ]);

  if (observation.status === "rejected") throw observation.reason;
  if (deletionOutcome.status === "rejected") throw deletionOutcome.reason;

  return {
    blockedQuery: observation.value.query,
    outcome,
  };
}

async function resetFixture(sql: Sql): Promise<void> {
  await clearFixture(sql);
  await sql`
    insert into users (id, display_name)
    values (${ownerId}, 'Journal link lock fixture')
  `;
  await sql`
    insert into drills (id, user_id, title, summary)
    values (${drillId}, ${ownerId}, 'Journal link lock drill', '')
  `;
  await sql`
    insert into journal_entries (
      id,
      user_id,
      drill_id,
      occurred_on,
      caption,
      status
    )
    values (
      ${entryId},
      ${ownerId},
      ${drillId},
      '2026-09-01',
      'Original caption',
      'ready'
    )
  `;
  await sql`
    insert into journal_media (
      id,
      journal_entry_id,
      storage_path,
      media_kind,
      mime_type,
      size_bytes
    )
    values (
      ${mediaId},
      ${entryId},
      ${`${ownerId}/${entryId}/video.mp4`},
      'video',
      'video/mp4',
      10
    )
  `;
}

async function clearFixture(sql: Sql): Promise<void> {
  await sql`delete from users where id = ${ownerId}`;
}

async function waitForLockWait(
  sql: Sql,
  applicationName: string,
): Promise<{ query: string }> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [activity] = await sql<{
      query: string;
      state: string;
      waitEventType: string | null;
    }[]>`
      select
        query,
        state,
        wait_event_type as "waitEventType"
      from pg_stat_activity
      where application_name = ${applicationName}
        and pid <> pg_backend_pid()
      order by query_start desc
      limit 1
    `;
    if (activity?.state === "active" && activity.waitEventType === "Lock") {
      return { query: activity.query };
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Journal mutation did not reach the expected PostgreSQL lock wait.");
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
