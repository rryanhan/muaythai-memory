import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionCounts } from "./contracts";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    execute: mocks.execute,
    select: mocks.select,
  },
}));

import { getConnectionsSummary, getFighterProfileByUsername } from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";
const viewerId = "22222222-2222-4222-8222-222222222222";

describe("connection count queries", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
  });

  it("loads every direction, status, and blocked count in one statement", async () => {
    const expected: ConnectionCounts = {
      followers: 11,
      following: 12,
      incoming: 13,
      outgoing: 14,
      blocked: 15,
    };

    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain(
        `count(*) filter (where "follows"."status" = 'accepted')::integer as "followers", ` +
          `count(*) filter (where "follows"."status" = 'pending')::integer as "incoming" ` +
          `from "follows" where "follows"."following_id" = $1`,
      );
      expect(normalizedSql).toContain(
        `count(*) filter (where "follows"."status" = 'accepted')::integer as "following", ` +
          `count(*) filter (where "follows"."status" = 'pending')::integer as "outgoing" ` +
          `from "follows" where "follows"."follower_id" = $2`,
      );
      expect(normalizedSql).toContain(
        `select count(*)::integer as "blocked" from "user_blocks" ` +
          `where "user_blocks"."blocker_id" = $3`,
      );
      expect(compiled.params).toEqual([userId, userId, userId]);
      return [expected];
    });

    await expect(getConnectionsSummary(userId)).resolves.toEqual({ counts: expected });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("loads accepted public follower directions in one statement", async () => {
    mocks.select
      .mockImplementationOnce(() => queryReturning([{
        id: userId,
        username: "target_fighter",
        avatarUrl: null,
      }]))
      .mockImplementationOnce(() => queryReturning([]))
      .mockImplementationOnce(() => queryReturning([]));

    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain(
        `select count(*)::integer as "followers" from "follows" ` +
          `where "follows"."following_id" = $1 and "follows"."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(
        `select count(*)::integer as "following" from "follows" ` +
          `where "follows"."follower_id" = $2 and "follows"."status" = 'accepted'`,
      );
      expect(compiled.params).toEqual([userId, userId]);
      return [{ followers: 7, following: 9 }];
    });

    const fighter = await getFighterProfileByUsername(viewerId, "target_fighter");

    expect(fighter?.socialCounts).toEqual({ followers: 7, following: 9 });
    expect(fighter?.stats).toBeNull();
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});

function queryReturning(rows: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => (
      Promise.resolve(rows).then(resolve, reject)
    ),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.limit.mockResolvedValue(rows);
  return builder;
}
