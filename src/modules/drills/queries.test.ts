import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillFilters, DrillSummary } from "./contracts";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: { execute: mocks.execute, select: mocks.select },
}));

import {
  drillMatchesFilters,
  getDrillById,
  getDrillSummariesByOwnerPairs,
  getOwnedDrillHeader,
  hasActiveDrillFilters,
  listDrills,
  normalizeDrillFilters,
} from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";
const drillId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.select.mockReset();
});

describe("drillMatchesFilters", () => {
  it("does not read drill fields when no filters are active", () => {
    const accessed: string[] = [];
    const filters = normalizeDrillFilters();

    expect(hasActiveDrillFilters(filters)).toBe(false);
    expect(drillMatchesFilters(createObservedDrill(accessed), filters)).toBe(true);
    expect(accessed).toEqual([]);
  });

  it.each([
    {
      label: "method",
      filters: { methodSlugs: ["boxing"] },
      accessed: ["trainingMethods"],
    },
    {
      label: "tags",
      filters: { tagSlugs: ["sharp"] },
      accessed: ["tags", "customTags"],
    },
    {
      label: "status",
      filters: { statusTagSlugs: ["starred"] },
      accessed: ["statusTags"],
    },
  ])("reads only the relation projection required by a $label filter", ({
    filters,
    accessed: expectedAccesses,
  }) => {
    const accessed: string[] = [];

    expect(drillMatchesFilters(
      createObservedDrill(accessed),
      normalizeDrillFilters(filters),
    )).toBe(true);
    expect(accessed).toEqual(expectedAccesses);
  });

  it("does not build the search haystack after an earlier filter rejects the drill", () => {
    const accessed: string[] = [];

    expect(drillMatchesFilters(
      createObservedDrill(accessed),
      normalizeDrillFilters({ methodSlugs: ["sparring"], keywords: ["jab"] }),
    )).toBe(false);
    expect(accessed).toEqual(["trainingMethods"]);
  });

  it.each([
    [{}, true],
    [{ methodSlugs: ["boxing"] }, true],
    [{ methodSlugs: ["sparring"] }, false],
    [{ tagSlugs: ["jab", "sharp"] }, true],
    [{ tagSlugs: ["jab", "missing"] }, false],
    [{ tagSlugs: ["missing", "sharp"], tagMode: "any" as const }, true],
    [{ statusTagSlugs: ["starred"] }, true],
    [{ statusTagSlugs: ["reviewed"] }, false],
    [{ keywords: ["step", "boxing"] }, true],
    [{ keywords: ["step", "missing"] }, false],
    [{ methodSlugs: ["boxing"], tagSlugs: ["jab"], keywords: ["starred"] }, true],
  ] satisfies Array<[Partial<DrillFilters>, boolean]>)(
    "preserves filter output for %#",
    (filters, expected) => {
      expect(
        drillMatchesFilters(observedDrillValues, normalizeDrillFilters(filters)),
      ).toBe(expected);
    },
  );
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

describe("getDrillById", () => {
  it("loads the complete owned detail in one ordered, relation-filtered statement", async () => {
    const now = new Date("2026-09-11T00:00:00Z");
    const expected = {
      id: drillId,
      title: "Rear round kick",
      summary: "Turn the hip over.",
      notes: "Stay balanced.",
      trainingMethods: [{
        id: "33333333-3333-4333-8333-333333333333",
        name: "Pad work",
        slug: "pad-work",
        iconKey: "pad-work",
        sortOrder: 1,
      }],
      tags: [{
        id: "44444444-4444-4444-8444-444444444444",
        name: "Round kick",
        slug: "round-kick",
        kind: "standard" as const,
        sortOrder: 1,
        category: null,
      }],
      customTags: [],
      statusTags: [],
      createdAt: now,
      updatedAt: now,
      steps: [{
        id: "55555555-5555-4555-8555-555555555555",
        position: 0,
        body: "Turn the hip over.",
      }],
    };
    mocks.execute.mockResolvedValueOnce([{
      ...expected,
      createdAt: "2026-09-10 17:00:00-07",
      updatedAt: "2026-09-10 17:00:00-07",
    }]);

    const detail = await getDrillById(userId, drillId);

    expect(detail).toEqual(expected);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();

    const statement = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]?.[0]);
    const normalizedSql = statement.sql.replace(/\s+/g, " ").trim();
    expect(statement.params).toEqual([drillId, userId]);
    expect(normalizedSql).toContain(
      'where "drills"."id" = $1 and "drills"."user_id" = $2 limit 1',
    );
    expect(normalizedSql).toContain(
      '"training_methods"."active" = true',
    );
    expect(normalizedSql).toContain(
      'order by "training_methods"."sort_order", "training_methods"."name"',
    );
    expect(normalizedSql).toContain(
      'and ("tags"."user_id" is null or "tags"."user_id" = "drills"."user_id")',
    );
    expect(normalizedSql).toContain(
      ') filter (where tag_row."kind" = \'standard\')',
    );
    expect(normalizedSql).toContain(
      ') filter (where tag_row."kind" = \'custom\')',
    );
    expect(normalizedSql).toContain(
      '"status_tags"."active" = true',
    );
    expect(normalizedSql).toContain(
      'order by "drill_steps"."position"',
    );
    expect(normalizedSql.match(/from "drill_tags"/g)).toHaveLength(1);
  });

  it("returns null without issuing relation follow-up queries when ownership does not match", async () => {
    mocks.execute.mockResolvedValueOnce([]);

    await expect(getDrillById(userId, drillId)).resolves.toBeNull();

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

describe("listDrills", () => {
  it("hydrates the default graph in one statement while omitting unused tag relations", async () => {
    const now = new Date("2026-09-11T00:00:00Z");
    mocks.execute.mockResolvedValueOnce([{
      id: drillId,
      userId,
      title: "Rear round kick",
      summary: "Turn the hip over.",
      trainingMethods: [{
        id: "33333333-3333-4333-8333-333333333333",
        name: "Pad work",
        slug: "pad-work",
        iconKey: "pad-work",
        sortOrder: 1,
      }],
      tags: [],
      customTags: [],
      statusTags: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }]);

    const response = await listDrills(userId, {}, {
      includeTags: false,
      includeStatusTags: false,
    });

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(response.drills[0]).toMatchObject({
      id: drillId,
      tags: [],
      customTags: [],
      statusTags: [],
      trainingMethods: [{ slug: "pad-work" }],
      createdAt: now,
      updatedAt: now,
    });

    const statement = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]?.[0]);
    const normalizedSql = statement.sql.replace(/\s+/g, " ").trim();
    expect(statement.params).toEqual([userId]);
    expect(normalizedSql).toContain("with owned_drills as materialized");
    expect(normalizedSql).toContain('join "drill_training_methods"');
    expect(normalizedSql).not.toContain('join "drill_tags"');
    expect(normalizedSql).not.toContain('join "drill_status_tags"');
    expect(normalizedSql).toContain(
      'order by owned_drills."createdAt" desc, owned_drills."title" asc',
    );
  });

  it("hydrates every searchable label in the same statement when keyword filtering is requested", async () => {
    const now = new Date("2026-09-11T00:00:00Z");
    mocks.execute.mockResolvedValueOnce([{
      id: drillId,
      userId,
      title: "Rear round kick",
      summary: "Turn the hip over.",
      trainingMethods: [],
      tags: [],
      customTags: [{
        id: "44444444-4444-4444-8444-444444444444",
        name: "Counter timing",
        slug: "counter-timing",
        kind: "custom" as const,
        sortOrder: 1,
        category: null,
      }],
      statusTags: [],
      createdAt: now,
      updatedAt: now,
    }]);

    const response = await listDrills(
      userId,
      { keywords: ["counter"] },
      { includeTags: false, includeStatusTags: false },
    );

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(response.drills.map((drill) => drill.id)).toEqual([drillId]);
    expect(response.drills[0]?.customTags.map((tag) => tag.slug)).toEqual([
      "counter-timing",
    ]);

    const statement = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]?.[0]);
    const normalizedSql = statement.sql.replace(/\s+/g, " ").trim();
    expect(normalizedSql).toContain('join "drill_tags"');
    expect(normalizedSql).toContain('join "drill_status_tags"');
  });

  it.each([
    {
      label: "tag filters",
      filters: { tagSlugs: ["counter-timing"] },
      includedTable: 'join "drill_tags"',
      omittedTable: 'join "drill_status_tags"',
      row: {
        tags: [{
          id: "44444444-4444-4444-8444-444444444444",
          name: "Counter timing",
          slug: "counter-timing",
          kind: "standard" as const,
          sortOrder: 1,
          category: null,
        }],
        customTags: [],
        statusTags: [],
      },
    },
    {
      label: "status filters",
      filters: { statusTagSlugs: ["starred"] },
      includedTable: 'join "drill_status_tags"',
      omittedTable: 'join "drill_tags"',
      row: {
        tags: [],
        customTags: [],
        statusTags: [{
          id: "55555555-5555-4555-8555-555555555555",
          name: "Starred",
          slug: "starred",
          sortOrder: 1,
        }],
      },
    },
  ])("forces only the relation required by $label", async ({
    filters,
    includedTable,
    omittedTable,
    row,
  }) => {
    const now = new Date("2026-09-11T00:00:00Z");
    mocks.execute.mockResolvedValueOnce([{
      id: drillId,
      userId,
      title: "Rear round kick",
      summary: "Turn the hip over.",
      trainingMethods: [],
      ...row,
      createdAt: now,
      updatedAt: now,
    }]);

    await listDrills(userId, filters, {
      includeTags: false,
      includeStatusTags: false,
    });

    expect(mocks.execute).toHaveBeenCalledOnce();
    const statement = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]?.[0]);
    const normalizedSql = statement.sql.replace(/\s+/g, " ").trim();
    expect(normalizedSql).toContain(includedTable);
    expect(normalizedSql).not.toContain(omittedTable);
  });
});

describe("getDrillSummariesByOwnerPairs", () => {
  it("returns immediately for empty input", async () => {
    await expect(getDrillSummariesByOwnerPairs([])).resolves.toEqual([]);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("omits status tags and batches mixed owners in one statement", async () => {
    const ownerA = userId;
    const ownerB = "33333333-3333-4333-8333-333333333333";
    const drillA = drillId;
    const drillB = "44444444-4444-4444-8444-444444444444";
    const now = new Date("2026-09-10T00:00:00Z");
    mocks.execute.mockResolvedValueOnce([
      {
        id: drillB,
        userId: ownerB,
        title: "B",
        summary: "B summary",
        trainingMethods: [],
        tags: [],
        customTags: [{
          id: "55555555-5555-4555-8555-555555555555",
          name: "Owner B tag",
          slug: "owner-b-tag",
          kind: "custom" as const,
          sortOrder: 1,
          category: null,
        }],
        statusTags: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: drillA,
        userId: ownerA,
        title: "A",
        summary: "A summary",
        trainingMethods: [{
          id: "66666666-6666-4666-8666-666666666666",
          name: "Method",
          slug: "method",
          iconKey: "method",
          sortOrder: 1,
        }],
        tags: [],
        customTags: [],
        statusTags: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await getDrillSummariesByOwnerPairs([
      { ownerId: ownerA, drillId: drillA },
      { ownerId: ownerB, drillId: drillB },
      { ownerId: ownerA, drillId: drillA },
      { ownerId: ownerA, drillId: drillB },
    ], { includeStatusTags: false });

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(result.map((drill) => drill.id)).toEqual([drillA, drillB, drillA]);
    expect(result[0]?.trainingMethods).toHaveLength(1);
    expect(result[0]?.statusTags).toEqual([]);
    expect(result[1]?.customTags.map((tag) => tag.slug)).toEqual(["owner-b-tag"]);

    const statement = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]?.[0]);
    const normalizedSql = statement.sql.replace(/\s+/g, " ").trim();
    expect(statement.params).toEqual([
      ownerA,
      drillA,
      ownerB,
      drillB,
      ownerA,
      drillB,
    ]);
    expect(normalizedSql).toContain(
      'inner join (values ($1::uuid, $2::uuid), ($3::uuid, $4::uuid), ($5::uuid, $6::uuid))',
    );
    expect(normalizedSql).toContain('join "drill_tags"');
    expect(normalizedSql).not.toContain('join "drill_status_tags"');
  });

  it("hydrates status tags by default for generic callers", async () => {
    const now = new Date("2026-09-10T00:00:00Z");
    mocks.execute.mockResolvedValueOnce([{
      id: drillId,
      userId,
      title: "A",
      summary: "A summary",
      trainingMethods: [],
      tags: [],
      customTags: [],
      statusTags: [{
        id: "status",
        name: "Learning",
        slug: "learning",
        sortOrder: 1,
      }],
      createdAt: now,
      updatedAt: now,
    }]);

    const [result] = await getDrillSummariesByOwnerPairs([{ ownerId: userId, drillId }]);

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(result?.statusTags.map((status) => status.slug)).toEqual(["learning"]);
    const statement = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]?.[0]);
    expect(statement.sql).toContain('join "drill_status_tags"');
  });
});

const observedDrillValues: DrillSummary = {
  id: drillId,
  title: "Jab entry",
  summary: "Step in behind the jab.",
  trainingMethods: [{
    id: "33333333-3333-4333-8333-333333333333",
    name: "Boxing",
    slug: "boxing",
    iconKey: "boxing",
    sortOrder: 1,
  }],
  tags: [{
    id: "44444444-4444-4444-8444-444444444444",
    name: "Jab",
    slug: "jab",
    kind: "standard",
    sortOrder: 1,
    category: null,
  }],
  customTags: [{
    id: "55555555-5555-4555-8555-555555555555",
    name: "Sharp",
    slug: "sharp",
    kind: "custom",
    sortOrder: 1,
    category: null,
  }],
  statusTags: [{
    id: "66666666-6666-4666-8666-666666666666",
    name: "Starred",
    slug: "starred",
    sortOrder: 1,
  }],
  createdAt: new Date("2026-09-11T00:00:00Z"),
  updatedAt: new Date("2026-09-11T00:00:00Z"),
};

function createObservedDrill(accessed: string[]): DrillSummary {
  return Object.defineProperties({
    id: observedDrillValues.id,
    createdAt: observedDrillValues.createdAt,
    updatedAt: observedDrillValues.updatedAt,
  }, {
    title: observedProperty("title", observedDrillValues.title, accessed),
    summary: observedProperty("summary", observedDrillValues.summary, accessed),
    trainingMethods: observedProperty(
      "trainingMethods",
      observedDrillValues.trainingMethods,
      accessed,
    ),
    tags: observedProperty("tags", observedDrillValues.tags, accessed),
    customTags: observedProperty("customTags", observedDrillValues.customTags, accessed),
    statusTags: observedProperty("statusTags", observedDrillValues.statusTags, accessed),
  }) as DrillSummary;
}

function observedProperty<T>(name: string, value: T, accessed: string[]): PropertyDescriptor {
  return {
    enumerable: true,
    get() {
      accessed.push(name);
      return value;
    },
  };
}

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
