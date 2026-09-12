import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getDrillById: vi.fn(),
  inserted: [] as Array<{ table: unknown; values: unknown }>,
  transaction: vi.fn(),
  updateWhere: null as SQL | null,
}));

vi.mock("@/db/client", () => ({
  db: {
    execute: mocks.execute,
    transaction: mocks.transaction,
  },
}));

vi.mock("./queries", () => ({
  getDrillById: mocks.getDrillById,
}));

import {
  drillStatusTags,
  drillTags,
  drillTrainingMethods,
  drills,
} from "@/db/schema";
import {
  createDrill,
  CreateDrillValidationError,
  updateDrill,
  UpdateDrillValidationError,
} from "./mutations";

const userId = "11111111-1111-4111-8111-111111111111";
const drillId = "22222222-2222-4222-8222-222222222222";
const methodOneId = "33333333-3333-4333-8333-333333333333";
const methodTwoId = "44444444-4444-4444-8444-444444444444";
const tagOneId = "55555555-5555-4555-8555-555555555555";
const tagTwoId = "66666666-6666-4666-8666-666666666666";
const statusId = "77777777-7777-4777-8777-777777777777";
const tagThreeId = "99999999-9999-4999-8999-999999999999";

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.getDrillById.mockReset();
  mocks.inserted = [];
  mocks.transaction.mockReset();
  mocks.updateWhere = null;
});

describe("drill taxonomy validation", () => {
  it("loads and maps every active taxonomy kind in one statement for creation", async () => {
    mocks.execute.mockImplementationOnce(async (query) => {
      const statement = new PgDialect().sqlToQuery(query);
      const normalizedSql = statement.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain(
        `from "training_methods" where ("training_methods"."slug" in ($1, $2) ` +
          `and "training_methods"."active" = $3)`,
      );
      expect(normalizedSql).toContain(
        `from "tags" where ("tags"."slug" in ($4, $5) and "tags"."active" = $6 ` +
          `and ("tags"."user_id" is null or "tags"."user_id" = $7))`,
      );
      expect(normalizedSql).toContain(
        `from "status_tags" where ("status_tags"."slug" in ($8) ` +
          `and "status_tags"."active" = $9)`,
      );
      expect(statement.params).toEqual([
        "pad-work",
        "bag-work",
        true,
        "rear-kick",
        "my-counter",
        true,
        userId,
        "starred",
        true,
      ]);

      return [{
        methodRows: [
          { id: methodOneId, slug: "pad-work" },
          { id: methodTwoId, slug: "bag-work" },
        ],
        tagRows: [
          { id: tagOneId, slug: "rear-kick" },
          { id: tagTwoId, slug: "rear-kick" },
          { id: tagThreeId, slug: "my-counter" },
        ],
        statusRows: [{ id: statusId, slug: "starred" }],
      }];
    });
    installTransaction({ createdDrillId: drillId });
    const detail = drillDetail();
    mocks.getDrillById.mockResolvedValueOnce(detail);

    await expect(createDrill(userId, drillInput())).resolves.toBe(detail);

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(insertedValuesFor(drillTrainingMethods)).toEqual([[
      { drillId, trainingMethodId: methodOneId },
      { drillId, trainingMethodId: methodTwoId },
    ]]);
    expect(insertedValuesFor(drillTags)).toEqual([[
      { drillId, tagId: tagOneId },
      { drillId, tagId: tagTwoId },
      { drillId, tagId: tagThreeId },
    ]]);
    expect(insertedValuesFor(drillStatusTags)).toEqual([[
      { drillId, statusTagId: statusId },
    ]]);
  });

  it("reports missing unique slugs in the existing method, tag, status order", async () => {
    mocks.execute.mockResolvedValueOnce([{
      methodRows: [{ id: methodOneId, slug: "pad-work" }],
      tagRows: [{ id: tagOneId, slug: "rear-kick" }],
      statusRows: [],
    }]);

    const error = await createDrill(userId, drillInput()).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CreateDrillValidationError);
    expect(error).toMatchObject({
      issues: [
        "Training Method not found: bag-work",
        "Tag not found: my-counter",
        "Status not found: starred",
      ],
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.getDrillById).not.toHaveBeenCalled();
  });

  it("omits optional taxonomy tables and validates before update ownership", async () => {
    mocks.execute.mockImplementationOnce(async (query) => {
      const statement = new PgDialect().sqlToQuery(query);
      const normalizedSql = statement.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain('from "training_methods"');
      expect(normalizedSql).not.toContain('from "tags"');
      expect(normalizedSql).not.toContain('from "status_tags"');
      expect(statement.params).toEqual(["pad-work", true]);
      return [{ methodRows: [], tagRows: [], statusRows: [] }];
    });

    const error = await updateDrill(
      userId,
      drillId,
      drillInput({
        trainingMethodSlugs: ["pad-work"],
        tagSlugs: [],
        statusTagSlugs: [],
      }),
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UpdateDrillValidationError);
    expect(error).toMatchObject({
      issues: ["Training Method not found: pad-work"],
      status: 400,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("keeps the owned-drill 404 after a successful one-statement validation", async () => {
    mocks.execute.mockResolvedValueOnce([{
      methodRows: [{ id: methodOneId, slug: "pad-work" }],
      tagRows: [],
      statusRows: [],
    }]);
    installTransaction({ updatedDrillRows: [] });

    const error = await updateDrill(
      userId,
      drillId,
      drillInput({
        trainingMethodSlugs: ["pad-work"],
        tagSlugs: [],
        statusTagSlugs: [],
      }),
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UpdateDrillValidationError);
    expect(error).toMatchObject({ issues: ["Drill not found."], status: 404 });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.updateWhere).not.toBeNull();
    const ownershipQuery = new PgDialect().sqlToQuery(mocks.updateWhere as SQL);
    expect(ownershipQuery.sql).toContain(
      `"drills"."id" = $1 and "drills"."user_id" = $2`,
    );
    expect(ownershipQuery.params).toEqual([drillId, userId]);
  });
});

function drillInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Rear kick entry",
    summary: "Turn the hip over.",
    notes: null,
    steps: ["Set the stance."],
    trainingMethodSlugs: ["pad-work", "bag-work", "pad-work"],
    tagSlugs: ["rear-kick", "my-counter", "rear-kick"],
    statusTagSlugs: ["starred", "starred"],
    ...overrides,
  };
}

function drillDetail() {
  const timestamp = new Date("2026-09-11T00:00:00.000Z");
  return {
    id: drillId,
    title: "Rear kick entry",
    summary: "Turn the hip over.",
    notes: null,
    steps: [{
      id: "88888888-8888-4888-8888-888888888888",
      position: 1,
      body: "Set the stance.",
    }],
    trainingMethods: [],
    tags: [],
    customTags: [],
    statusTags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function installTransaction({
  createdDrillId,
  updatedDrillRows = [{ id: drillId }],
}: {
  createdDrillId?: string;
  updatedDrillRows?: Array<{ id: string }>;
}) {
  const tx = {
    insert: vi.fn((table: unknown) => {
      const builder = mutationBuilder();
      builder.values.mockImplementation((values: unknown) => {
        mocks.inserted.push({ table, values });
        return builder;
      });
      builder.returning.mockResolvedValue(
        table === drills && createdDrillId ? [{ id: createdDrillId }] : [],
      );
      return builder;
    }),
    update: vi.fn(() => {
      const builder = mutationBuilder();
      builder.where.mockImplementation((where: SQL) => {
        mocks.updateWhere = where;
        return builder;
      });
      builder.returning.mockResolvedValue(updatedDrillRows);
      return builder;
    }),
  };
  mocks.transaction.mockImplementation(async (
    callback: (transaction: typeof tx) => Promise<unknown>,
  ) => callback(tx));
}

function mutationBuilder() {
  const builder = {
    returning: vi.fn(),
    set: vi.fn(),
    values: vi.fn(),
    where: vi.fn(),
  };
  builder.set.mockReturnValue(builder);
  builder.values.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

function insertedValuesFor(table: unknown) {
  return mocks.inserted
    .filter((entry) => entry.table === table)
    .map((entry) => entry.values);
}
