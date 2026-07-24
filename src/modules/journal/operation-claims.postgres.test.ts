import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const entryId = "20000000-0000-4000-8000-000000000001";
const mediaId = "30000000-0000-4000-8000-000000000001";
const initialPosterPath = `${userA}/${entryId}/poster-40000000-0000-4000-8000-000000000001.webp`;
const firstPosterPath = `${userA}/${entryId}/poster-40000000-0000-4000-8000-000000000002.webp`;
const secondPosterPath = `${userA}/${entryId}/poster-40000000-0000-4000-8000-000000000003.webp`;
const operationToken = "50000000-0000-4000-8000-000000000001";
const operationStartedAt = "2026-07-23T12:00:00Z";

type MutationModule = typeof import("./mutations");

let connectionA: Sql;
let connectionB: Sql;
let databaseA: ReturnType<typeof drizzle<typeof schema>>;
let databaseB: ReturnType<typeof drizzle<typeof schema>>;
let mutations: MutationModule;

describePostgres("journal operation claims with PostgreSQL", () => {
  beforeAll(async () => {
    assertLoopbackTestDatabase(databaseUrl!);
    connectionA = postgres(databaseUrl!, { max: 1, prepare: false });
    connectionB = postgres(databaseUrl!, { max: 1, prepare: false });
    databaseA = drizzle(connectionA, { schema });
    databaseB = drizzle(connectionB, { schema });
    mutations = await import("./mutations");

    const [pidA] = await connectionA<{ pid: number }[]>`select pg_backend_pid() as pid`;
    const [pidB] = await connectionB<{ pid: number }[]>`select pg_backend_pid() as pid`;
    expect(pidA.pid).not.toBe(pidB.pid);
  });

  beforeEach(async () => {
    await resetFixture(connectionA);
  });

  afterAll(async () => {
    if (!connectionA || !connectionB) return;
    await connectionA`delete from journal_entries where id = ${entryId}`;
    await connectionA`delete from users where id in (${userA}, ${userB})`;
    await Promise.all([connectionA.end(), connectionB.end()]);
  });

  it("serializes simultaneous poster claims and lets only the persisted token finalize", async () => {
    const [claimA, claimB] = await Promise.all([
      mutations.claimPosterSave(userA, entryId, databaseA),
      mutations.claimPosterSave(userA, entryId, databaseB),
    ]);
    expect(claimA.token).not.toBe(claimB.token);

    const [persisted] = await connectionA<{ media_operation_token: string }[]>`
      select media_operation_token
      from journal_entries
      where id = ${entryId}
    `;
    const winner = persisted.media_operation_token === claimA.token
      ? { claim: claimA, database: databaseA, posterPath: firstPosterPath }
      : { claim: claimB, database: databaseB, posterPath: secondPosterPath };
    const loser = persisted.media_operation_token === claimA.token
      ? { claim: claimB, database: databaseB, posterPath: secondPosterPath }
      : { claim: claimA, database: databaseA, posterPath: firstPosterPath };

    await expect(mutations.finalizePosterSave(
      userA,
      entryId,
      loser.claim.token,
      loser.posterPath,
      loser.database,
    )).resolves.toBeNull();
    await expect(mutations.finalizePosterSave(
      userA,
      entryId,
      winner.claim.token,
      winner.posterPath,
      winner.database,
    )).resolves.toEqual({ previousPosterPath: initialPosterPath });

    const [row] = await connectionA<{
      media_operation: string | null;
      poster_path: string;
    }[]>`
      select e.media_operation, m.poster_path
      from journal_entries e
      join journal_media m on m.journal_entry_id = e.id
      where e.id = ${entryId}
    `;
    expect(row).toEqual({
      media_operation: null,
      poster_path: winner.posterPath,
    });
  });

  it("makes delete the surviving owner in a simultaneous poster/delete race", async () => {
    const [posterResult, deleteResult] = await Promise.allSettled([
      mutations.claimPosterSave(userA, entryId, databaseA),
      mutations.claimDeletion(userA, entryId, databaseB),
    ]);
    expect(deleteResult.status).toBe("fulfilled");
    if (deleteResult.status !== "fulfilled") throw deleteResult.reason;

    await expectPersistedOperation("delete", deleteResult.value.token);
    if (posterResult.status === "fulfilled") {
      await expect(mutations.finalizePosterSave(
        userA,
        entryId,
        posterResult.value.token,
        firstPosterPath,
        databaseA,
      )).resolves.toBeNull();
    } else {
      expect(posterResult.reason).toMatchObject({ status: 409 });
    }
    await expect(mutations.finalizeDeletion(
      userA,
      entryId,
      "delete",
      deleteResult.value.token,
      undefined,
      databaseB,
    )).resolves.toBe(true);
  });

  it("makes delete the surviving owner in a simultaneous completion/delete race", async () => {
    const [completionResult, deleteResult] = await Promise.allSettled([
      mutations.claimCompletion(userA, entryId, databaseA),
      mutations.claimDeletion(userA, entryId, databaseB),
    ]);
    expect(deleteResult.status).toBe("fulfilled");
    if (deleteResult.status !== "fulfilled") throw deleteResult.reason;

    await expectPersistedOperation("delete", deleteResult.value.token);
    if (completionResult.status === "fulfilled") {
      expect(completionResult.value.kind).toBe("claimed");
      if (completionResult.value.kind !== "claimed") throw new Error("Expected a completion claim.");
      await expect(mutations.finalizeReadyUpload(
        userA,
        entryId,
        completionResult.value.token,
        databaseA,
      )).resolves.toBe(false);
    } else {
      expect(completionResult.reason).toMatchObject({ status: 409 });
    }
    await expect(mutations.finalizeDeletion(
      userA,
      entryId,
      "delete",
      deleteResult.value.token,
      undefined,
      databaseB,
    )).resolves.toBe(true);
  });

  it("enforces operation-token CAS as poster, completion, and delete supersede one another", async () => {
    const posterClaim = await mutations.claimPosterSave(userA, entryId, databaseA);
    const completionClaim = await mutations.claimCompletion(userA, entryId, databaseB);
    expect(completionClaim.kind).toBe("claimed");
    if (completionClaim.kind !== "claimed") throw new Error("Expected a completion claim.");
    const deleteClaim = await mutations.claimDeletion(userA, entryId, databaseA);

    await expect(mutations.finalizePosterSave(
      userA,
      entryId,
      posterClaim.token,
      firstPosterPath,
      databaseA,
    )).resolves.toBeNull();
    await expect(mutations.finalizeReadyUpload(
      userA,
      entryId,
      completionClaim.token,
      databaseB,
    )).resolves.toBe(false);
    await expect(mutations.finalizeDeletion(
      userA,
      entryId,
      "delete",
      deleteClaim.token,
      undefined,
      databaseA,
    )).resolves.toBe(true);
    await expect(connectionA`select id from journal_entries where id = ${entryId}`)
      .resolves.toHaveLength(0);
  });

  it("rejects cross-user poster, completion, and delete claims without changing ownership state", async () => {
    await expect(mutations.claimPosterSave(userB, entryId, databaseA))
      .rejects.toMatchObject({ status: 404 });
    await expect(mutations.claimCompletion(userB, entryId, databaseB))
      .rejects.toMatchObject({ status: 404 });
    await expect(mutations.claimDeletion(userB, entryId, databaseA))
      .rejects.toMatchObject({ status: 404 });

    const [row] = await connectionA<{
      media_operation: string | null;
      media_operation_token: string | null;
      user_id: string;
    }[]>`
      select user_id, media_operation, media_operation_token
      from journal_entries
      where id = ${entryId}
    `;
    expect(row).toEqual({
      media_operation: null,
      media_operation_token: null,
      user_id: userA,
    });
  });

  it("rejects cross-user poster, completion, and delete finalizers without consuming owner claims", async () => {
    const posterClaim = await mutations.claimPosterSave(userA, entryId, databaseA);
    await expect(mutations.finalizePosterSave(
      userB,
      entryId,
      posterClaim.token,
      firstPosterPath,
      databaseB,
    )).resolves.toBeNull();
    await expectPersistedOperation("poster", posterClaim.token);
    await expect(mutations.finalizePosterSave(
      userA,
      entryId,
      posterClaim.token,
      firstPosterPath,
      databaseA,
    )).resolves.toEqual({ previousPosterPath: initialPosterPath });

    await resetFixture(connectionA);
    const completionClaim = await mutations.claimCompletion(userA, entryId, databaseA);
    expect(completionClaim.kind).toBe("claimed");
    if (completionClaim.kind !== "claimed") throw new Error("Expected a completion claim.");
    await expect(mutations.finalizeReadyUpload(
      userB,
      entryId,
      completionClaim.token,
      databaseB,
    )).resolves.toBe(false);
    await expectPersistedOperation("complete", completionClaim.token);
    await expect(mutations.finalizeReadyUpload(
      userA,
      entryId,
      completionClaim.token,
      databaseA,
    )).resolves.toBe(true);

    await resetFixture(connectionA);
    const deleteClaim = await mutations.claimDeletion(userA, entryId, databaseA);
    await expect(mutations.finalizeDeletion(
      userB,
      entryId,
      "delete",
      deleteClaim.token,
      undefined,
      databaseB,
    )).resolves.toBe(false);
    await expectPersistedOperation("delete", deleteClaim.token);
    await expect(mutations.finalizeDeletion(
      userA,
      entryId,
      "delete",
      deleteClaim.token,
      undefined,
      databaseA,
    )).resolves.toBe(true);
  });

  it.each([
    ["operation only", "poster", null, null],
    ["token only", null, operationToken, null],
    ["timestamp only", null, null, operationStartedAt],
    ["operation and token", "poster", operationToken, null],
    ["operation and timestamp", "poster", null, operationStartedAt],
    ["token and timestamp", null, operationToken, operationStartedAt],
  ] as const)(
    "rejects the partial operation tuple: %s",
    async (_label, operation, token, startedAt) => {
      await expect(connectionA`
        update journal_entries
        set media_operation = ${operation},
            media_operation_token = ${token},
            media_operation_started_at = ${startedAt}
        where id = ${entryId}
      `).rejects.toThrow(/journal_entries_media_operation_check/);
    },
  );

  it("rejects an unknown complete operation tuple at the PostgreSQL constraint", async () => {
    await expect(connectionA`
      update journal_entries
      set media_operation = 'unknown',
          media_operation_token = ${operationToken},
          media_operation_started_at = now()
      where id = ${entryId}
    `).rejects.toThrow(/journal_entries_media_operation_check/);
  });

  it.each(["token", "poster", "complete", "delete", "cleanup"] as const)(
    "accepts the supported complete operation tuple: %s",
    async (operation) => {
      await expect(connectionA`
        update journal_entries
        set media_operation = ${operation},
            media_operation_token = ${operationToken},
            media_operation_started_at = now()
        where id = ${entryId}
      `).resolves.toEqual([]);
    },
  );

  it("accepts the fully empty operation tuple", async () => {
    await expect(connectionA`
      update journal_entries
      set media_operation = null,
          media_operation_token = null,
          media_operation_started_at = null
      where id = ${entryId}
    `).resolves.toEqual([]);
  });
});

async function expectPersistedOperation(operation: string, token: string): Promise<void> {
  const [row] = await connectionA<{
    media_operation: string | null;
    media_operation_token: string | null;
  }[]>`
    select media_operation, media_operation_token
    from journal_entries
    where id = ${entryId}
  `;
  expect(row).toEqual({
    media_operation: operation,
    media_operation_token: token,
  });
}

async function resetFixture(sql: Sql): Promise<void> {
  await sql`delete from journal_entries where id = ${entryId}`;
  await sql`delete from users where id in (${userA}, ${userB})`;
  await sql`
    insert into users (id, display_name)
    values (${userA}, 'Owner'), (${userB}, 'Other user')
  `;
  await sql`
    insert into journal_entries (
      id,
      user_id,
      occurred_on,
      status,
      media_operation,
      media_operation_token,
      media_operation_started_at
    )
    values (
      ${entryId},
      ${userA},
      '2026-07-23',
      'uploading',
      null,
      null,
      null
    )
  `;
  await sql`
    insert into journal_media (
      id,
      journal_entry_id,
      storage_path,
      media_kind,
      mime_type,
      size_bytes,
      poster_path
    )
    values (
      ${mediaId},
      ${entryId},
      ${`${userA}/${entryId}/video.mp4`},
      'video',
      'video/mp4',
      10,
      ${initialPosterPath}
    )
  `;
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
