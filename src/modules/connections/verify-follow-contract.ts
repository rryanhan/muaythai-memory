import assert from "node:assert/strict";
import type { TransactionSql } from "postgres";
import { postgresClient } from "@/db/client";

type ContractPhase = "expand" | "contract";

type CatalogState = {
  followsTablePresent: boolean;
  friendshipsRelationPresent: boolean;
  friendshipsTablePresent: boolean;
  mirrorFunctionPresent: boolean;
  mirrorTriggerPresent: boolean;
  rateLimitActionConstraint: string | null;
  rateLimitActionConstraintValidated: boolean;
  expandMigrationApplied: boolean;
  contractMigrationApplied: boolean;
};

type RelationshipCounts = {
  accepted: number;
  pending: number;
};

type CurrentCounts = RelationshipCounts & {
  requestRateLimitRows: number;
};

type ContractSnapshot = {
  catalogState: CatalogState;
  currentCounts: CurrentCounts;
  legacyCounts: RelationshipCounts | null;
};

const EXPAND_MIGRATION_TIMESTAMP = 1786304472349;
const CONTRACT_MIGRATION_TIMESTAMP = 1788054974010;

async function main() {
  const expectedPhase = readExpectedPhase();
  const { catalogState, currentCounts, legacyCounts } = await readSnapshot(
    expectedPhase,
  );

  assert.equal(catalogState.followsTablePresent, true, "The follows table is missing.");
  assert.equal(
    catalogState.rateLimitActionConstraintValidated,
    true,
    "The friend rate-limit action constraint is not validated.",
  );
  assert.ok(
    catalogState.rateLimitActionConstraint,
    "The friend rate-limit action constraint is missing.",
  );
  const rateLimitActions = extractConstraintValues(
    catalogState.rateLimitActionConstraint,
  );

  if (expectedPhase === "expand") {
    assert.equal(
      catalogState.expandMigrationApplied,
      true,
      "The directed-follows expand migration has not run.",
    );
    assert.equal(catalogState.contractMigrationApplied, false);
    assert.equal(catalogState.friendshipsRelationPresent, true);
    assert.equal(catalogState.friendshipsTablePresent, true);
    assert.equal(catalogState.mirrorFunctionPresent, true);
    assert.equal(catalogState.mirrorTriggerPresent, true);
    assert.deepEqual(rateLimitActions, ["follow", "report", "request", "search"]);
  } else {
    assert.equal(
      catalogState.expandMigrationApplied,
      true,
      "The directed-follows expand migration is missing from migration history.",
    );
    assert.equal(
      catalogState.contractMigrationApplied,
      true,
      "The directed-follows contract migration has not run.",
    );
    assert.equal(catalogState.friendshipsRelationPresent, false);
    assert.equal(catalogState.friendshipsTablePresent, false);
    assert.equal(catalogState.mirrorFunctionPresent, false);
    assert.equal(catalogState.mirrorTriggerPresent, false);
    assert.equal(currentCounts.requestRateLimitRows, 0);
    assert.deepEqual(rateLimitActions, ["follow", "report", "search"]);
  }

  console.log(`Follow database contract verified for the ${expectedPhase} phase.`);
  console.log(
    `Current follows: ${currentCounts.accepted} accepted, ${currentCounts.pending} pending.`,
  );
  if (legacyCounts) {
    console.log(
      `Legacy friendships (informational only): ${legacyCounts.accepted} accepted, ${legacyCounts.pending} pending.`,
    );
  }
}

async function readSnapshot(expectedPhase: ContractPhase): Promise<ContractSnapshot> {
  return postgresClient.begin(
    "isolation level repeatable read read only",
    async (transaction) => {
      // This prevents a concurrent contract migration from dropping the table
      // between the expand-phase catalog read and its informational count.
      if (expectedPhase === "expand") {
        await transaction`lock table public.friendships in access share mode`;
      }

      const [catalogState] = await transaction<CatalogState[]>`
        select
          exists (
            select 1
            from pg_class relation
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'follows'
              and relation.relkind in ('r', 'p')
          ) as "followsTablePresent",
          to_regclass('public.friendships') is not null
            as "friendshipsRelationPresent",
          exists (
            select 1
            from pg_class relation
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'friendships'
              and relation.relkind in ('r', 'p')
          ) as "friendshipsTablePresent",
          to_regprocedure('public.mirror_friendship_to_follows()') is not null
            as "mirrorFunctionPresent",
          exists (
            select 1
            from pg_trigger trigger_row
            join pg_class relation on relation.oid = trigger_row.tgrelid
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'friendships'
              and trigger_row.tgname = 'friendships_mirror_follows_trigger'
              and trigger_row.tgenabled = 'O'
              and trigger_row.tgfoid = to_regprocedure(
                'public.mirror_friendship_to_follows()'
              )
              and not trigger_row.tgisinternal
          ) as "mirrorTriggerPresent",
          (
            select pg_get_constraintdef(constraint_row.oid)
            from pg_constraint constraint_row
            join pg_class relation on relation.oid = constraint_row.conrelid
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'friend_rate_limits'
              and constraint_row.conname = 'friend_rate_limits_action_check'
          ) as "rateLimitActionConstraint",
          coalesce((
            select constraint_row.convalidated
            from pg_constraint constraint_row
            join pg_class relation on relation.oid = constraint_row.conrelid
            join pg_namespace namespace on namespace.oid = relation.relnamespace
            where namespace.nspname = 'public'
              and relation.relname = 'friend_rate_limits'
              and constraint_row.conname = 'friend_rate_limits_action_check'
          ), false) as "rateLimitActionConstraintValidated",
          exists (
            select 1
            from drizzle.__drizzle_migrations
            where created_at = ${EXPAND_MIGRATION_TIMESTAMP}
          ) as "expandMigrationApplied",
          exists (
            select 1
            from drizzle.__drizzle_migrations
            where created_at = ${CONTRACT_MIGRATION_TIMESTAMP}
          ) as "contractMigrationApplied"
      `;
      assert.ok(catalogState, "Could not read the follow database contract.");

      const [currentCounts] = await transaction<CurrentCounts[]>`
        select
          count(*) filter (where status = 'accepted')::integer as "accepted",
          count(*) filter (where status = 'pending')::integer as "pending",
          (
            select count(*)::integer
            from public.friend_rate_limits
            where action = 'request'
          ) as "requestRateLimitRows"
        from public.follows
      `;
      assert.ok(currentCounts, "Could not read current follow counts.");

      const legacyCounts = catalogState.friendshipsTablePresent
        ? await readLegacyCounts(transaction)
        : null;
      return { catalogState, currentCounts, legacyCounts };
    },
  );
}

async function readLegacyCounts(
  transaction: TransactionSql<Record<string, never>>,
) {
  const [counts] = await transaction<RelationshipCounts[]>`
    select
      count(*) filter (where status = 'accepted')::integer as "accepted",
      count(*) filter (where status = 'pending')::integer as "pending"
    from public.friendships
  `;
  assert.ok(counts, "Could not read legacy friendship counts.");
  return counts;
}

function readExpectedPhase(): ContractPhase {
  const value = process.argv
    .find((argument) => argument.startsWith("--expect="))
    ?.slice("--expect=".length);
  if (value === "expand" || value === "contract") return value;
  throw new Error("Pass exactly one expected phase: --expect=expand or --expect=contract.");
}

function extractConstraintValues(definition: string) {
  return [
    ...new Set(
      Array.from(definition.matchAll(/'([^']+)'/g), (match) => match[1]!),
    ),
  ].sort();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
