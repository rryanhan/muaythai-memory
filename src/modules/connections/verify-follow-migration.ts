import assert from "node:assert/strict";
import type { TransactionSql } from "postgres";
import { postgresClient } from "@/db/client";

const rollbackSignal = new Error("ROLLBACK_FOLLOW_MIGRATION_VERIFICATION");

async function main() {
  const [coverage] = await postgresClient<{
    acceptedFriendships: number;
    pendingFriendships: number;
    acceptedFollowRows: number;
    pendingFollowRows: number;
    missingAccepted: number;
    missingPending: number;
  }[]>`
    select
      (select count(*)::integer from friendships where status = 'accepted') as "acceptedFriendships",
      (select count(*)::integer from friendships where status = 'pending') as "pendingFriendships",
      (select count(*)::integer from follows where status = 'accepted') as "acceptedFollowRows",
      (select count(*)::integer from follows where status = 'pending') as "pendingFollowRows",
      (
        select count(*)::integer
        from friendships friendship
        cross join lateral (
          values
            (friendship.user_one_id, friendship.user_two_id),
            (friendship.user_two_id, friendship.user_one_id)
        ) direction(follower_id, following_id)
        where friendship.status = 'accepted'
          and not exists (
            select 1 from follows follow_row
            where follow_row.follower_id = direction.follower_id
              and follow_row.following_id = direction.following_id
              and follow_row.status = 'accepted'
          )
      ) as "missingAccepted",
      (
        select count(*)::integer
        from friendships friendship
        where friendship.status = 'pending'
          and not exists (
            select 1 from follows follow_row
            where follow_row.follower_id = friendship.requested_by_id
              and follow_row.following_id = case
                when friendship.requested_by_id = friendship.user_one_id then friendship.user_two_id
                else friendship.user_one_id
              end
              and follow_row.status = 'pending'
          )
      ) as "missingPending"
  `;
  assert.ok(coverage);
  assert.equal(coverage.missingAccepted, 0, "Accepted friendship backfill is incomplete.");
  assert.equal(coverage.missingPending, 0, "Pending friendship direction backfill is incomplete.");

  try {
    await postgresClient.begin(async (transaction) => {
      const [{ beforeCount }] = await transaction<{ beforeCount: number }[]>`
        select count(*)::integer as "beforeCount" from follows
      `;
      await runBackfill(transaction);
      await runBackfill(transaction);
      const [{ afterCount }] = await transaction<{ afterCount: number }[]>`
        select count(*)::integer as "afterCount" from follows
      `;
      assert.equal(afterCount, beforeCount, "Migration backfill must be idempotent.");
      throw rollbackSignal;
    });
  } catch (error) {
    if (error !== rollbackSignal) throw error;
  }

  console.log(
    `Follow migration verification passed: ${coverage.acceptedFriendships} accepted friendships map to reciprocal rows and ${coverage.pendingFriendships} pending friendships preserve direction.`,
  );
  console.log(
    `Current follow rows: ${coverage.acceptedFollowRows} accepted, ${coverage.pendingFollowRows} pending.`,
  );
}

async function runBackfill(transaction: TransactionSql<Record<string, never>>) {
  await transaction`
    insert into follows (
      follower_id, following_id, status, responded_at, created_at, updated_at
    )
    select
      user_one_id, user_two_id, 'accepted',
      coalesce(responded_at, updated_at), created_at, updated_at
    from friendships where status = 'accepted'
    union all
    select
      user_two_id, user_one_id, 'accepted',
      coalesce(responded_at, updated_at), created_at, updated_at
    from friendships where status = 'accepted'
    on conflict (follower_id, following_id) do update set
      status = excluded.status,
      responded_at = excluded.responded_at,
      updated_at = excluded.updated_at
  `;
  await transaction`
    insert into follows (
      follower_id, following_id, status, responded_at, created_at, updated_at
    )
    select
      requested_by_id,
      case when requested_by_id = user_one_id then user_two_id else user_one_id end,
      'pending', null, created_at, updated_at
    from friendships where status = 'pending'
    on conflict (follower_id, following_id) do nothing
  `;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
