import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: { execute: mocks.execute },
}));

import { getProfileOverview } from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";

describe("getProfileOverview", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
  });

  it("returns distinct saved-list and multi-method counts in one statement", async () => {
    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql.match(/count\(distinct "drills"\."id"\)/g)).toHaveLength(4);
      expect(normalizedSql).toContain(
        `where "status_tags"."active" = true and "status_tags"."slug" = 'starred'`,
      );
      expect(normalizedSql).toContain(
        `where "status_tags"."active" = true and "status_tags"."slug" = 'drill-back-in'`,
      );
      expect(normalizedSql).toContain(`and "training_methods"."active" = true`);
      expect(compiled.params).toEqual([userId, userId]);

      return [
        {
          drillCount: 3,
          favouriteCount: 2,
          drillBackInCount: 1,
          methodId: "22222222-2222-4222-8222-222222222222",
          methodName: "Pad Work",
          methodSlug: "pad-work",
          methodIconKey: "pad-work",
          methodCount: 2,
        },
        {
          drillCount: 3,
          favouriteCount: 2,
          drillBackInCount: 1,
          methodId: "33333333-3333-4333-8333-333333333333",
          methodName: "Technical Work",
          methodSlug: "technical-work",
          methodIconKey: "technical-work",
          methodCount: 2,
        },
      ];
    });

    await expect(getProfileOverview(userId)).resolves.toEqual({
      drillCount: 3,
      favouriteCount: 2,
      drillBackInCount: 1,
      trainingMethods: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Pad Work",
          slug: "pad-work",
          iconKey: "pad-work",
          count: 2,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Technical Work",
          slug: "technical-work",
          iconKey: "technical-work",
          count: 2,
        },
      ],
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns zero counts and no methods for an empty profile", async () => {
    mocks.execute.mockResolvedValueOnce([{
      drillCount: 0,
      favouriteCount: 0,
      drillBackInCount: 0,
      methodId: null,
      methodName: null,
      methodSlug: null,
      methodIconKey: null,
      methodCount: null,
    }]);

    await expect(getProfileOverview(userId)).resolves.toEqual({
      drillCount: 0,
      favouriteCount: 0,
      drillBackInCount: 0,
      trainingMethods: [],
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
