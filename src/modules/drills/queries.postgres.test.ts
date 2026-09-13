import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  assertLoopbackPostgresTestDatabase,
  resolvePostgresTestDatabaseUrl,
} from "@/test-support/postgres-test-database";
import {
  getDrillById,
  getDrillSummariesByOwnerPairs,
  listDrills,
} from "./queries";

const databaseUrl = resolvePostgresTestDatabaseUrl();
const describePostgres = databaseUrl ? describe : describe.skip;

const ownerId = "71000000-0000-4000-8000-000000000001";
const otherUserId = "71000000-0000-4000-8000-000000000002";
const drillId = "72000000-0000-4000-8000-000000000001";
const relationlessDrillId = "72000000-0000-4000-8000-000000000002";
const otherOwnerDrillId = "72000000-0000-4000-8000-000000000003";
const bagWorkMethodId = "73000000-0000-4000-8000-000000000001";
const sparringMethodId = "73000000-0000-4000-8000-000000000002";
const inactiveMethodId = "73000000-0000-4000-8000-000000000003";
const categoryId = "74000000-0000-4000-8000-000000000001";
const crossTagId = "75000000-0000-4000-8000-000000000001";
const roundKickTagId = "75000000-0000-4000-8000-000000000002";
const balanceTagId = "75000000-0000-4000-8000-000000000003";
const powerTagId = "75000000-0000-4000-8000-000000000004";
const foreignCustomTagId = "75000000-0000-4000-8000-000000000005";
const inactiveTagId = "75000000-0000-4000-8000-000000000006";
const learningStatusId = "76000000-0000-4000-8000-000000000001";
const favouriteStatusId = "76000000-0000-4000-8000-000000000002";
const inactiveStatusId = "76000000-0000-4000-8000-000000000003";
const firstStepId = "77000000-0000-4000-8000-000000000001";
const secondStepId = "77000000-0000-4000-8000-000000000002";
const createdAt = new Date("2026-09-10T10:00:00.000Z");
const updatedAt = new Date("2026-09-11T11:30:00.000Z");
const relationlessCreatedAt = new Date("2026-09-12T09:00:00.000Z");
const otherOwnerCreatedAt = new Date("2026-09-13T09:00:00.000Z");

let connection: Sql;
let database: ReturnType<typeof drizzle<typeof schema>>;

describePostgres("drill query aggregation with PostgreSQL", () => {
  beforeAll(() => {
    assertLoopbackPostgresTestDatabase(databaseUrl!);
    connection = postgres(databaseUrl!, { max: 1, prepare: false });
    database = drizzle(connection, { schema });
  });

  beforeEach(async () => {
    await resetFixture(connection);
  });

  afterAll(async () => {
    if (!connection) return;
    await clearFixture(connection);
    await connection.end();
  });

  it("returns the exact ordered detail while excluding inactive and foreign-owned relations", async () => {
    await expect(getDrillById(ownerId, drillId, { database })).resolves.toEqual({
      id: drillId,
      title: "Rear round kick counter",
      summary: "Catch, return, and recover stance.",
      notes: "Keep the guard high.",
      trainingMethods: [
        {
          id: bagWorkMethodId,
          name: "Bag work fixture",
          slug: "query-fixture-bag-work",
          iconKey: "bag",
          sortOrder: 10,
        },
        {
          id: sparringMethodId,
          name: "Sparring fixture",
          slug: "query-fixture-sparring",
          iconKey: "sparring",
          sortOrder: 20,
        },
      ],
      tags: [
        {
          id: crossTagId,
          name: "Cross fixture",
          slug: "query-fixture-cross",
          kind: "standard",
          sortOrder: 10,
          category: {
            id: categoryId,
            name: "Striking fixture",
            slug: "query-fixture-striking",
          },
        },
        {
          id: roundKickTagId,
          name: "Round kick fixture",
          slug: "query-fixture-round-kick",
          kind: "standard",
          sortOrder: 20,
          category: {
            id: categoryId,
            name: "Striking fixture",
            slug: "query-fixture-striking",
          },
        },
      ],
      customTags: [
        {
          id: balanceTagId,
          name: "Balance cue fixture",
          slug: "query-fixture-balance-cue",
          kind: "custom",
          sortOrder: 10,
          category: null,
        },
        {
          id: powerTagId,
          name: "Power cue fixture",
          slug: "query-fixture-power-cue",
          kind: "custom",
          sortOrder: 20,
          category: null,
        },
      ],
      statusTags: [
        {
          id: learningStatusId,
          name: "Learning fixture",
          slug: "query-fixture-learning",
          sortOrder: 10,
        },
        {
          id: favouriteStatusId,
          name: "Favourite fixture",
          slug: "query-fixture-favourite",
          sortOrder: 20,
        },
      ],
      createdAt,
      updatedAt,
      steps: [
        { id: firstStepId, position: 0, body: "Catch the kick." },
        { id: secondStepId, position: 1, body: "Return the cross." },
      ],
    });
  });

  it("returns null when the same drill is requested by a different user", async () => {
    await expect(getDrillById(otherUserId, drillId, { database })).resolves.toBeNull();
  });

  it("returns ordered full summaries and preserves drills without active relations", async () => {
    const response = await listDrills(ownerId, {}, { database });

    expect(response.drills.map((drill) => drill.id)).toEqual([
      relationlessDrillId,
      drillId,
    ]);
    expect(response.drills[0]).toEqual({
      id: relationlessDrillId,
      title: "A relationless drill",
      summary: "No active relations yet.",
      trainingMethods: [],
      tags: [],
      customTags: [],
      statusTags: [],
      createdAt: relationlessCreatedAt,
      updatedAt: relationlessCreatedAt,
    });
    expect(response.drills[1]).toMatchObject({
      id: drillId,
      trainingMethods: [
        { id: bagWorkMethodId, sortOrder: 10 },
        { id: sparringMethodId, sortOrder: 20 },
      ],
      tags: [
        { id: crossTagId, sortOrder: 10 },
        { id: roundKickTagId, sortOrder: 20 },
      ],
      customTags: [
        { id: balanceTagId, sortOrder: 10 },
        { id: powerTagId, sortOrder: 20 },
      ],
      statusTags: [
        { id: learningStatusId, sortOrder: 10 },
        { id: favouriteStatusId, sortOrder: 20 },
      ],
      createdAt,
      updatedAt,
    });
    expect(response.drills[1]?.customTags.map((tag) => tag.id)).not.toContain(
      foreignCustomTagId,
    );
  });

  it("executes every optional-relation combination and still hydrates labels required for filtering", async () => {
    const lean = await listDrills(ownerId, {}, {
      includeTags: false,
      includeStatusTags: false,
      database,
    });
    expect(lean.drills.find((drill) => drill.id === drillId)).toMatchObject({
      trainingMethods: [
        { id: bagWorkMethodId },
        { id: sparringMethodId },
      ],
      tags: [],
      customTags: [],
      statusTags: [],
    });

    const tagsOnly = await listDrills(ownerId, {}, {
      includeTags: true,
      includeStatusTags: false,
      database,
    });
    expect(tagsOnly.drills.find((drill) => drill.id === drillId)).toMatchObject({
      tags: [
        { id: crossTagId },
        { id: roundKickTagId },
      ],
      customTags: [
        { id: balanceTagId },
        { id: powerTagId },
      ],
      statusTags: [],
    });

    const statusOnly = await listDrills(ownerId, {}, {
      includeTags: false,
      includeStatusTags: true,
      database,
    });
    expect(statusOnly.drills.find((drill) => drill.id === drillId)).toMatchObject({
      tags: [],
      customTags: [],
      statusTags: [
        { id: learningStatusId },
        { id: favouriteStatusId },
      ],
    });

    const keywordMatch = await listDrills(
      ownerId,
      { keywords: ["power cue"] },
      { includeTags: false, includeStatusTags: false, database },
    );
    expect(keywordMatch.drills.map((drill) => drill.id)).toEqual([drillId]);
    expect(keywordMatch.drills[0]?.customTags.map((tag) => tag.id)).toEqual([
      balanceTagId,
      powerTagId,
    ]);
  });

  it("batches mixed owners while preserving requested order and duplicates", async () => {
    const summaries = await getDrillSummariesByOwnerPairs([
      { ownerId: otherUserId, drillId: otherOwnerDrillId },
      { ownerId, drillId },
      { ownerId: otherUserId, drillId: otherOwnerDrillId },
      { ownerId, drillId: otherOwnerDrillId },
    ], {
      includeStatusTags: false,
      database,
    });

    expect(summaries.map((drill) => drill.id)).toEqual([
      otherOwnerDrillId,
      drillId,
      otherOwnerDrillId,
    ]);
    expect(summaries[0]).toMatchObject({
      trainingMethods: [{ id: bagWorkMethodId }],
      tags: [],
      customTags: [{ id: foreignCustomTagId }],
      statusTags: [],
      createdAt: otherOwnerCreatedAt,
      updatedAt: otherOwnerCreatedAt,
    });
    expect(summaries[1]?.customTags.map((tag) => tag.id)).toEqual([
      balanceTagId,
      powerTagId,
    ]);
  });
});

async function resetFixture(sql: Sql): Promise<void> {
  await clearFixture(sql);
  await sql`
    insert into users (id, display_name)
    values (${ownerId}, 'Drill query owner'), (${otherUserId}, 'Other drill query user')
  `;
  await sql`
    insert into training_methods (id, name, slug, icon_key, sort_order, active)
    values
      (${bagWorkMethodId}, 'Bag work fixture', 'query-fixture-bag-work', 'bag', 10, true),
      (${sparringMethodId}, 'Sparring fixture', 'query-fixture-sparring', 'sparring', 20, true),
      (${inactiveMethodId}, 'Inactive method fixture', 'query-fixture-inactive-method', 'inactive', 0, false)
  `;
  await sql`
    insert into tag_categories (id, name, slug, sort_order)
    values (${categoryId}, 'Striking fixture', 'query-fixture-striking', 10)
  `;
  await sql`
    insert into tags (id, user_id, category_id, name, slug, kind, sort_order, active)
    values
      (${crossTagId}, null, ${categoryId}, 'Cross fixture', 'query-fixture-cross', 'standard', 10, true),
      (${roundKickTagId}, null, ${categoryId}, 'Round kick fixture', 'query-fixture-round-kick', 'standard', 20, true),
      (${balanceTagId}, ${ownerId}, null, 'Balance cue fixture', 'query-fixture-balance-cue', 'custom', 10, true),
      (${powerTagId}, ${ownerId}, null, 'Power cue fixture', 'query-fixture-power-cue', 'custom', 20, true),
      (${foreignCustomTagId}, ${otherUserId}, null, 'Foreign cue fixture', 'query-fixture-foreign-cue', 'custom', 0, true),
      (${inactiveTagId}, null, ${categoryId}, 'Inactive tag fixture', 'query-fixture-inactive-tag', 'standard', 0, false)
  `;
  await sql`
    insert into status_tags (id, name, slug, sort_order, active)
    values
      (${learningStatusId}, 'Learning fixture', 'query-fixture-learning', 10, true),
      (${favouriteStatusId}, 'Favourite fixture', 'query-fixture-favourite', 20, true),
      (${inactiveStatusId}, 'Inactive status fixture', 'query-fixture-inactive-status', 0, false)
  `;
  await sql`
    insert into drills (id, user_id, title, summary, notes, created_at, updated_at)
    values
      (
        ${drillId},
        ${ownerId},
        'Rear round kick counter',
        'Catch, return, and recover stance.',
        'Keep the guard high.',
        ${createdAt.toISOString()},
        ${updatedAt.toISOString()}
      ),
      (
        ${relationlessDrillId},
        ${ownerId},
        'A relationless drill',
        'No active relations yet.',
        null,
        ${relationlessCreatedAt.toISOString()},
        ${relationlessCreatedAt.toISOString()}
      ),
      (
        ${otherOwnerDrillId},
        ${otherUserId},
        'Other owner drill',
        'Owned by the second fixture user.',
        null,
        ${otherOwnerCreatedAt.toISOString()},
        ${otherOwnerCreatedAt.toISOString()}
      )
  `;
  await sql`
    insert into drill_training_methods (drill_id, training_method_id)
    values
      (${drillId}, ${sparringMethodId}),
      (${drillId}, ${inactiveMethodId}),
      (${drillId}, ${bagWorkMethodId}),
      (${otherOwnerDrillId}, ${bagWorkMethodId})
  `;
  await sql`
    insert into drill_tags (drill_id, tag_id)
    values
      (${drillId}, ${roundKickTagId}),
      (${drillId}, ${powerTagId}),
      (${drillId}, ${foreignCustomTagId}),
      (${drillId}, ${inactiveTagId}),
      (${drillId}, ${crossTagId}),
      (${drillId}, ${balanceTagId}),
      (${otherOwnerDrillId}, ${foreignCustomTagId})
  `;
  await sql`
    insert into drill_status_tags (drill_id, status_tag_id)
    values
      (${drillId}, ${favouriteStatusId}),
      (${drillId}, ${inactiveStatusId}),
      (${drillId}, ${learningStatusId})
  `;
  await sql`
    insert into drill_steps (id, drill_id, position, body)
    values
      (${secondStepId}, ${drillId}, 1, 'Return the cross.'),
      (${firstStepId}, ${drillId}, 0, 'Catch the kick.')
  `;
}

async function clearFixture(sql: Sql): Promise<void> {
  await sql`
    delete from drills
    where id in (${drillId}, ${relationlessDrillId}, ${otherOwnerDrillId})
  `;
  await sql`
    delete from tags
    where id in (
      ${crossTagId},
      ${roundKickTagId},
      ${balanceTagId},
      ${powerTagId},
      ${foreignCustomTagId},
      ${inactiveTagId}
    )
  `;
  await sql`delete from users where id in (${ownerId}, ${otherUserId})`;
  await sql`
    delete from training_methods
    where id in (${bagWorkMethodId}, ${sparringMethodId}, ${inactiveMethodId})
  `;
  await sql`
    delete from status_tags
    where id in (${learningStatusId}, ${favouriteStatusId}, ${inactiveStatusId})
  `;
  await sql`delete from tag_categories where id = ${categoryId}`;
}
