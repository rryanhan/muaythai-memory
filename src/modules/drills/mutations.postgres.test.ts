import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const ownerId = "78000000-0000-4000-8000-000000000001";
const drillId = "78000000-0000-4000-8000-000000000002";
const statusId = "78000000-0000-4000-8000-000000000003";
const toggleApplicationName = "drill_saved_list_lock_regression";

let fixtureConnection: Sql;
let observerConnection: Sql;
let toggleConnection: Sql;
let mutations: typeof import("./mutations");

describePostgres("Saved List mutation serialization with PostgreSQL", () => {
  beforeAll(async () => {
    assertLoopbackTestDatabase(databaseUrl!);
    fixtureConnection = postgres(databaseUrl!, {
      max: 1,
      prepare: false,
      connection: { application_name: "drill_saved_list_delete_fixture" },
    });
    observerConnection = postgres(databaseUrl!, {
      max: 1,
      prepare: false,
      connection: { application_name: "drill_saved_list_lock_observer" },
    });
    toggleConnection = postgres(databaseUrl!, {
      max: 1,
      prepare: false,
      connection: { application_name: toggleApplicationName },
    });
    const mutationDatabase = drizzle(toggleConnection, { schema });
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
      toggleConnection.end(),
    ]);
  });

  it("turns a concurrent drill deletion into the existing not-found result", async () => {
    const deletionStarted = deferred<void>();
    const deletionRelease = deferred<void>();
    const deletion = fixtureConnection.begin(async (tx) => {
      await tx`delete from drills where id = ${drillId}`;
      deletionStarted.resolve();
      await deletionRelease.promise;
    });
    await deletionStarted.promise;

    const toggleOutcomePromise = mutations.setDrillSavedList(ownerId, drillId, {
      slug: "starred",
      selected: true,
    }).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );

    try {
      const blockedActivity = await waitForLockWait(
        observerConnection,
        toggleApplicationName,
      );
      expect(normalizeSql(blockedActivity.query)).toMatch(
        /select .* from "drills" .* for update of "drills"/,
      );
    } finally {
      deletionRelease.resolve();
      await deletion;
    }

    const toggleOutcome = await toggleOutcomePromise;
    expect(toggleOutcome.status).toBe("rejected");
    if (toggleOutcome.status !== "rejected") {
      throw new Error("Saved List toggle unexpectedly survived a committed drill deletion.");
    }
    expect(toggleOutcome.reason).toBeInstanceOf(mutations.SavedListMutationError);
    expect(toggleOutcome.reason).toMatchObject({
      message: "Drill not found.",
      status: 404,
    });
  });
});

async function resetFixture(sql: Sql): Promise<void> {
  await clearFixture(sql);
  await sql`
    insert into users (id, display_name)
    values (${ownerId}, 'Saved List lock fixture')
  `;
  await sql`
    insert into status_tags (id, name, slug, sort_order, active)
    values (${statusId}, 'Favourite', 'starred', 10, true)
  `;
  await sql`
    insert into drills (id, user_id, title, summary)
    values (${drillId}, ${ownerId}, 'Saved List lock drill', '')
  `;
}

async function clearFixture(sql: Sql): Promise<void> {
  await sql`delete from drills where id = ${drillId}`;
  await sql`delete from status_tags where id = ${statusId}`;
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
  throw new Error("Saved List mutation did not reach the expected PostgreSQL lock wait.");
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function assertLoopbackTestDatabase(value: string): void {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (!loopback || !url.pathname.includes("muaythai_pr6_test")) {
    throw new Error(
      "JOURNAL_TEST_DATABASE_URL must target a loopback database whose name contains muaythai_pr6_test.",
    );
  }
}
