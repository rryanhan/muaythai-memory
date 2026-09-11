import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: { select: mocks.select },
}));

import { getDrillSummariesByOwnerPairs, getOwnedDrillHeader } from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";
const drillId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mocks.select.mockReset();
});

describe("getOwnedDrillHeader", () => {
  it("loads only the owned drill identity in one query", async () => {
    let whereQuery: unknown;
    const builder = queryReturning([{ id: drillId, title: "Rear round kick" }], (query) => {
      whereQuery = query;
    });
    mocks.select.mockReturnValueOnce(builder);

    await expect(getOwnedDrillHeader(userId, drillId)).resolves.toEqual({
      id: drillId,
      title: "Rear round kick",
    });

    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.anything(),
      title: expect.anything(),
    }));
    const compiled = new PgDialect().sqlToQuery(whereQuery as never);
    expect(compiled.sql.replace(/\s+/g, " ").trim()).toBe(
      '("drills"."id" = $1 and "drills"."user_id" = $2)',
    );
    expect(compiled.params).toEqual([drillId, userId]);
  });

  it("returns null when the owned drill does not exist", async () => {
    mocks.select.mockReturnValueOnce(queryReturning([]));

    await expect(getOwnedDrillHeader(userId, drillId)).resolves.toBeNull();
  });
});

describe("getDrillSummariesByOwnerPairs", () => {
  it("returns immediately for empty input", async () => {
    await expect(getDrillSummariesByOwnerPairs([])).resolves.toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("can omit discarded status tags and batch mixed owners in three statements", async () => {
    const ownerA = userId;
    const ownerB = "33333333-3333-4333-8333-333333333333";
    const drillA = drillId;
    const drillB = "44444444-4444-4444-8444-444444444444";
    const now = new Date("2026-09-10T00:00:00Z");
    let pairWhere: unknown;
    let methodWhere: unknown;
    let tagWhere: unknown;

    mocks.select
      .mockReturnValueOnce(fluentQueryReturning([
        { id: drillB, userId: ownerB, title: "B", summary: "B summary", notes: null, sourceTranscript: null, archivedAt: null, createdAt: now, updatedAt: now },
        { id: drillA, userId: ownerA, title: "A", summary: "A summary", notes: null, sourceTranscript: null, archivedAt: null, createdAt: now, updatedAt: now },
      ], (query) => { pairWhere = query; }))
      .mockReturnValueOnce(fluentQueryReturning([{ drillId: drillA, id: "method", name: "Method", slug: "method", iconKey: "method", sortOrder: 1 }], (query) => { methodWhere = query; }))
      .mockReturnValueOnce(fluentQueryReturning([{ drillId: drillB, id: "tag", name: "Owner B tag", slug: "owner-b-tag", kind: "custom", sortOrder: 1, categoryId: null, categoryName: null, categorySlug: null }], (query) => { tagWhere = query; }));

    const result = await getDrillSummariesByOwnerPairs([
      { ownerId: ownerA, drillId: drillA },
      { ownerId: ownerB, drillId: drillB },
      { ownerId: ownerA, drillId: drillA },
      { ownerId: ownerA, drillId: drillB },
    ], { includeStatusTags: false });

    expect(mocks.select).toHaveBeenCalledTimes(3);
    expect(result.map((drill) => drill.id)).toEqual([drillA, drillB, drillA]);
    expect(result[0]?.trainingMethods).toHaveLength(1);
    expect(result[0]?.statusTags).toEqual([]);
    expect(result[1]?.customTags.map((tag) => tag.slug)).toEqual(["owner-b-tag"]);

    const dialect = new PgDialect();
    const pairQuery = dialect.sqlToQuery(pairWhere as never);
    expect(pairQuery.params).toEqual([drillA, ownerA, drillB, ownerB, drillB, ownerA]);
    const tagQuery = dialect.sqlToQuery(tagWhere as never);
    expect(tagQuery.sql.replace(/\s+/g, " ")).toContain(
      '"tags"."active" = $3 and ("tags"."user_id" is null or "tags"."user_id" = "drills"."user_id")',
    );
    expect(tagQuery.params.at(-1)).toBe(true);
    expect(dialect.sqlToQuery(methodWhere as never).params.at(-1)).toBe(true);
  });

  it("hydrates status tags by default for generic callers", async () => {
    const now = new Date("2026-09-10T00:00:00Z");
    mocks.select
      .mockReturnValueOnce(fluentQueryReturning([{
        id: drillId,
        userId,
        title: "A",
        summary: "A summary",
        notes: null,
        sourceTranscript: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      }]))
      .mockReturnValueOnce(fluentQueryReturning([]))
      .mockReturnValueOnce(fluentQueryReturning([]))
      .mockReturnValueOnce(fluentQueryReturning([{
        drillId,
        id: "status",
        name: "Learning",
        slug: "learning",
        sortOrder: 1,
      }]));

    const [result] = await getDrillSummariesByOwnerPairs([{ ownerId: userId, drillId }]);

    expect(mocks.select).toHaveBeenCalledTimes(4);
    expect(result?.statusTags.map((status) => status.slug)).toEqual(["learning"]);
  });
});

function queryReturning(rows: unknown[], captureWhere: (query: unknown) => void = () => undefined) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockImplementation((query) => {
    captureWhere(query);
    return builder;
  });
  builder.limit.mockResolvedValue(rows);
  return builder;
}

function fluentQueryReturning(rows: unknown[], captureWhere: (query: unknown) => void = () => undefined) {
  const builder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => (
      Promise.resolve(rows).then(resolve, reject)
    ),
  };
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  builder.leftJoin.mockReturnValue(builder);
  builder.where.mockImplementation((query) => {
    captureWhere(query);
    return builder;
  });
  builder.orderBy.mockResolvedValue(rows);
  return builder;
}
