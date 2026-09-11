import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionCounts } from "./contracts";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    execute: mocks.execute,
  },
}));

import { getConnectionsSummary } from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";

describe("getConnectionsSummary", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
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
});
