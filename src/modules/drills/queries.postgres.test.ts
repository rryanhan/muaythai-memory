import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getDrillById } from "./queries";

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const ownerId = "71000000-0000-4000-8000-000000000001";
const otherUserId = "71000000-0000-4000-8000-000000000002";
const drillId = "72000000-0000-4000-8000-000000000001";
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

let connection: Sql;
let database: ReturnType<typeof drizzle<typeof schema>>;

describePostgres("drill detail aggregation with PostgreSQL", () => {
  beforeAll(() => {
    assertLoopbackTestDatabase(databaseUrl!);
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
    values (
      ${drillId},
      ${ownerId},
      'Rear round kick counter',
      'Catch, return, and recover stance.',
      'Keep the guard high.',
      ${createdAt.toISOString()},
      ${updatedAt.toISOString()}
    )
  `;
  await sql`
    insert into drill_training_methods (drill_id, training_method_id)
    values
      (${drillId}, ${sparringMethodId}),
      (${drillId}, ${inactiveMethodId}),
      (${drillId}, ${bagWorkMethodId})
  `;
  await sql`
    insert into drill_tags (drill_id, tag_id)
    values
      (${drillId}, ${roundKickTagId}),
      (${drillId}, ${powerTagId}),
      (${drillId}, ${foreignCustomTagId}),
      (${drillId}, ${inactiveTagId}),
      (${drillId}, ${crossTagId}),
      (${drillId}, ${balanceTagId})
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
  await sql`delete from drills where id = ${drillId}`;
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

function assertLoopbackTestDatabase(value: string): void {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (!loopback || !url.pathname.includes("muaythai_pr6_test")) {
    throw new Error(
      "JOURNAL_TEST_DATABASE_URL must target a loopback database whose name contains muaythai_pr6_test.",
    );
  }
}
