import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { postgresClient } from "@/db/client";

const rollbackSignal = new Error("ROLLBACK_FOLLOW_CONTRACT_MIGRATION_FIXTURE");
const migrationUrl = new URL(
  "../drizzle/0016_drop-legacy-friendships.sql",
  import.meta.url,
);

async function main() {
  assertIsolatedDatabase();
  const migrationSql = await readFile(migrationUrl, "utf8");
  const migrationStatements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  const requestOnlyUserId = randomUUID();
  const followOnlyUserId = randomUUID();
  const collisionUserId = randomUUID();
  const windowStart = "2026-08-29T18:00:00.000Z";

  try {
    await postgresClient.begin(async (transaction) => {
      await transaction`
        create table public.friendships (id integer primary key)
      `;
      await transaction`
        create function public.mirror_friendship_to_follows()
        returns trigger
        language plpgsql
        as $function$
        begin
          if tg_op = 'DELETE' then
            return old;
          end if;
          return new;
        end;
        $function$
      `;
      await transaction`
        create trigger friendships_mirror_follows_trigger
        after insert or update or delete on public.friendships
        for each row execute function public.mirror_friendship_to_follows()
      `;
      await transaction`
        alter table public.friend_rate_limits
        drop constraint friend_rate_limits_action_check
      `;
      await transaction`
        alter table public.friend_rate_limits
        add constraint friend_rate_limits_action_check
        check (action in ('search', 'request', 'follow', 'report'))
      `;
      await transaction`
        insert into public.users (id, display_name)
        values
          (${requestOnlyUserId}, 'Request only fixture'),
          (${followOnlyUserId}, 'Follow only fixture'),
          (${collisionUserId}, 'Collision fixture')
      `;
      await transaction`
        insert into public.friend_rate_limits (
          user_id, action, window_start, request_count, updated_at
        )
        values
          (${requestOnlyUserId}, 'request', ${windowStart}, 2, '2026-08-29T18:01:00.000Z'),
          (${followOnlyUserId}, 'follow', ${windowStart}, 4, '2026-08-29T18:02:00.000Z'),
          (${collisionUserId}, 'request', ${windowStart}, 3, '2026-08-29T18:03:00.000Z'),
          (${collisionUserId}, 'follow', ${windowStart}, 5, '2026-08-29T18:04:00.000Z')
      `;

      for (const statement of migrationStatements) {
        await transaction.unsafe(statement);
      }

      const rows = await transaction<{
        userId: string;
        action: string;
        requestCount: number;
      }[]>`
        select
          user_id as "userId",
          action,
          request_count as "requestCount"
        from public.friend_rate_limits
        where user_id in (
          ${requestOnlyUserId}, ${followOnlyUserId}, ${collisionUserId}
        )
      `;
      const countsByUser = new Map(
        rows.map((row) => [row.userId, { action: row.action, count: row.requestCount }]),
      );
      assert.deepEqual(countsByUser.get(requestOnlyUserId), {
        action: "follow",
        count: 2,
      });
      assert.deepEqual(countsByUser.get(followOnlyUserId), {
        action: "follow",
        count: 4,
      });
      assert.deepEqual(countsByUser.get(collisionUserId), {
        action: "follow",
        count: 8,
      });

      const [contractState] = await transaction<{
        friendshipsRemoved: boolean;
        mirrorFunctionRemoved: boolean;
        requestRows: number;
      }[]>`
        select
          to_regclass('public.friendships') is null as "friendshipsRemoved",
          to_regprocedure('public.mirror_friendship_to_follows()') is null
            as "mirrorFunctionRemoved",
          (
            select count(*)::integer
            from public.friend_rate_limits
            where action = 'request'
          ) as "requestRows"
      `;
      assert.deepEqual(contractState, {
        friendshipsRemoved: true,
        mirrorFunctionRemoved: true,
        requestRows: 0,
      });
      throw rollbackSignal;
    });
  } catch (error) {
    if (error !== rollbackSignal) throw error;
  }

  console.log(
    "Follow contract migration fixtures passed: request-only, follow-only, and collision counters are preserved.",
  );
}

function assertIsolatedDatabase() {
  const connectionString = process.env.DATABASE_POOLER_URL;
  assert.ok(connectionString, "DATABASE_POOLER_URL is required.");
  const databaseUrl = new URL(connectionString);
  assert.ok(
    databaseUrl.hostname === "127.0.0.1" || databaseUrl.hostname === "localhost",
    "Migration fixtures may run only against a local isolated PostgreSQL database.",
  );
  assert.match(
    databaseUrl.pathname,
    /_ci$/,
    "Migration fixture database name must end in _ci.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
