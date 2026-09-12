import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { TaxonomyResponse } from "./contracts";
import { getTaxonomy } from "./queries";

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const fixturePrefix = "taxonomy-query-fixture-";
const ownerId = "81000000-0000-4000-8000-000000000001";
const otherUserId = "81000000-0000-4000-8000-000000000002";
const earlyMethodId = "82000000-0000-4000-8000-000000000001";
const laterMethodId = "82000000-0000-4000-8000-000000000002";
const inactiveMethodId = "82000000-0000-4000-8000-000000000003";
const populatedCategoryId = "83000000-0000-4000-8000-000000000001";
const emptyCategoryId = "83000000-0000-4000-8000-000000000002";
const inactiveCategoryId = "83000000-0000-4000-8000-000000000003";
const inactiveCategoryTagId = "84000000-0000-4000-8000-000000000001";
const firstStandardTagId = "84000000-0000-4000-8000-000000000002";
const secondStandardTagId = "84000000-0000-4000-8000-000000000003";
const uncategorizedTagId = "84000000-0000-4000-8000-000000000004";
const inactiveStandardTagId = "84000000-0000-4000-8000-000000000005";
const firstCustomTagId = "84000000-0000-4000-8000-000000000006";
const secondCustomTagId = "84000000-0000-4000-8000-000000000007";
const foreignCustomTagId = "84000000-0000-4000-8000-000000000008";
const inactiveCustomTagId = "84000000-0000-4000-8000-000000000009";
const earlyStatusId = "85000000-0000-4000-8000-000000000001";
const laterStatusId = "85000000-0000-4000-8000-000000000002";
const inactiveStatusId = "85000000-0000-4000-8000-000000000003";

let connection: Sql;
let database: ReturnType<typeof drizzle<typeof schema>>;

describePostgres("taxonomy aggregation with PostgreSQL", () => {
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

  it("returns the exact ordered taxonomy while preserving visibility and category edges", async () => {
    const taxonomy = selectFixtureTaxonomy(await getTaxonomy(ownerId, { database }));

    expect(taxonomy).toEqual(expectedFixtureTaxonomy(allLayers));
  });

  it("preserves every include-option combination", async () => {
    for (const options of includeOptionCases()) {
      const taxonomy = selectFixtureTaxonomy(await getTaxonomy(ownerId, {
        ...options,
        database,
      }));

      expect(taxonomy, JSON.stringify(options)).toEqual(expectedFixtureTaxonomy(options));
    }
  });
});

const allLayers: IncludeOptions = {
  includeTagCategories: true,
  includeStandardTags: true,
  includeCustomTags: true,
  includeStatusTags: true,
};

const earlyMethod = {
  id: earlyMethodId,
  name: "Alpha method fixture",
  slug: `${fixturePrefix}alpha-method`,
  iconKey: "alpha-fixture",
  sortOrder: 10,
};

const laterMethod = {
  id: laterMethodId,
  name: "Zulu method fixture",
  slug: `${fixturePrefix}zulu-method`,
  iconKey: "zulu-fixture",
  sortOrder: 20,
};

const populatedCategory = {
  id: populatedCategoryId,
  name: "Populated category fixture",
  slug: `${fixturePrefix}populated-category`,
  sortOrder: 20,
};

const emptyCategory = {
  id: emptyCategoryId,
  name: "Empty category fixture",
  slug: `${fixturePrefix}empty-category`,
  sortOrder: 10,
};

const inactiveCategory = {
  id: inactiveCategoryId,
  name: "Inactive category fixture",
  slug: `${fixturePrefix}inactive-category`,
};

const inactiveCategoryTag = {
  id: inactiveCategoryTagId,
  name: "Visible tag in inactive category fixture",
  slug: `${fixturePrefix}inactive-category-tag`,
  kind: "standard" as const,
  sortOrder: 5,
  category: inactiveCategory,
};

const firstStandardTag = {
  id: firstStandardTagId,
  name: "Alpha standard tag fixture",
  slug: `${fixturePrefix}alpha-standard-tag`,
  kind: "standard" as const,
  sortOrder: 10,
  category: {
    id: populatedCategory.id,
    name: populatedCategory.name,
    slug: populatedCategory.slug,
  },
};

const secondStandardTag = {
  id: secondStandardTagId,
  name: "Zulu standard tag fixture",
  slug: `${fixturePrefix}zulu-standard-tag`,
  kind: "standard" as const,
  sortOrder: 20,
  category: {
    id: populatedCategory.id,
    name: populatedCategory.name,
    slug: populatedCategory.slug,
  },
};

const uncategorizedTag = {
  id: uncategorizedTagId,
  name: "Uncategorized standard tag fixture",
  slug: `${fixturePrefix}uncategorized-standard-tag`,
  kind: "standard" as const,
  sortOrder: 1,
  category: null,
};

const firstCustomTag = {
  id: firstCustomTagId,
  name: "Alpha custom cue fixture",
  slug: `${fixturePrefix}alpha-custom-cue`,
  kind: "custom" as const,
  sortOrder: 20,
  category: {
    id: populatedCategory.id,
    name: populatedCategory.name,
    slug: populatedCategory.slug,
  },
};

const secondCustomTag = {
  id: secondCustomTagId,
  name: "Zulu custom cue fixture",
  slug: `${fixturePrefix}zulu-custom-cue`,
  kind: "custom" as const,
  sortOrder: 10,
  category: null,
};

const earlyStatus = {
  id: earlyStatusId,
  name: "Alpha status fixture",
  slug: `${fixturePrefix}alpha-status`,
  sortOrder: 10,
};

const laterStatus = {
  id: laterStatusId,
  name: "Zulu status fixture",
  slug: `${fixturePrefix}zulu-status`,
  sortOrder: 20,
};

type IncludeOptions = {
  includeTagCategories: boolean;
  includeStandardTags: boolean;
  includeCustomTags: boolean;
  includeStatusTags: boolean;
};

function includeOptionCases(): IncludeOptions[] {
  return Array.from({ length: 16 }, (_, mask) => ({
    includeTagCategories: Boolean(mask & 1),
    includeStandardTags: Boolean(mask & 2),
    includeCustomTags: Boolean(mask & 4),
    includeStatusTags: Boolean(mask & 8),
  }));
}

function expectedFixtureTaxonomy(options: IncludeOptions): TaxonomyResponse {
  return {
    trainingMethods: [earlyMethod, laterMethod],
    tagCategories: options.includeTagCategories
      ? [
          { ...emptyCategory, tags: [] },
          {
            ...populatedCategory,
            tags: options.includeStandardTags
              ? [firstStandardTag, secondStandardTag]
              : [],
          },
        ]
      : [],
    standardTags: options.includeStandardTags
      ? [
          inactiveCategoryTag,
          firstStandardTag,
          secondStandardTag,
          uncategorizedTag,
        ]
      : [],
    customTags: options.includeCustomTags ? [firstCustomTag, secondCustomTag] : [],
    statusTags: options.includeStatusTags ? [earlyStatus, laterStatus] : [],
  };
}

function selectFixtureTaxonomy(taxonomy: TaxonomyResponse): TaxonomyResponse {
  return {
    trainingMethods: taxonomy.trainingMethods.filter((method) => method.slug.startsWith(fixturePrefix)),
    tagCategories: taxonomy.tagCategories
      .filter((category) => category.slug.startsWith(fixturePrefix))
      .map((category) => ({
        ...category,
        tags: category.tags.filter((tag) => tag.slug.startsWith(fixturePrefix)),
      })),
    standardTags: taxonomy.standardTags.filter((tag) => tag.slug.startsWith(fixturePrefix)),
    customTags: taxonomy.customTags.filter((tag) => tag.slug.startsWith(fixturePrefix)),
    statusTags: taxonomy.statusTags.filter((status) => status.slug.startsWith(fixturePrefix)),
  };
}

async function resetFixture(sql: Sql): Promise<void> {
  await clearFixture(sql);
  await sql`
    insert into users (id, display_name)
    values
      (${ownerId}, 'Taxonomy query owner'),
      (${otherUserId}, 'Other taxonomy query user')
  `;
  await sql`
    insert into training_methods (id, name, slug, icon_key, sort_order, active)
    values
      (${earlyMethodId}, 'Alpha method fixture', ${earlyMethod.slug}, 'alpha-fixture', 10, true),
      (${laterMethodId}, 'Zulu method fixture', ${laterMethod.slug}, 'zulu-fixture', 20, true),
      (${inactiveMethodId}, 'Inactive method fixture', ${fixturePrefix + "inactive-method"}, 'inactive-fixture', 0, false)
  `;
  await sql`
    insert into tag_categories (id, name, slug, sort_order, active)
    values
      (${populatedCategoryId}, 'Populated category fixture', ${populatedCategory.slug}, 20, true),
      (${emptyCategoryId}, 'Empty category fixture', ${emptyCategory.slug}, 10, true),
      (${inactiveCategoryId}, 'Inactive category fixture', ${inactiveCategory.slug}, 5, false)
  `;
  await sql`
    insert into tags (id, user_id, category_id, name, slug, kind, sort_order, active)
    values
      (
        ${inactiveCategoryTagId},
        null,
        ${inactiveCategoryId},
        'Visible tag in inactive category fixture',
        ${inactiveCategoryTag.slug},
        'standard',
        5,
        true
      ),
      (
        ${firstStandardTagId},
        null,
        ${populatedCategoryId},
        'Alpha standard tag fixture',
        ${firstStandardTag.slug},
        'standard',
        10,
        true
      ),
      (
        ${secondStandardTagId},
        null,
        ${populatedCategoryId},
        'Zulu standard tag fixture',
        ${secondStandardTag.slug},
        'standard',
        20,
        true
      ),
      (
        ${uncategorizedTagId},
        null,
        null,
        'Uncategorized standard tag fixture',
        ${uncategorizedTag.slug},
        'standard',
        1,
        true
      ),
      (
        ${inactiveStandardTagId},
        null,
        ${populatedCategoryId},
        'Inactive standard tag fixture',
        ${fixturePrefix + "inactive-standard-tag"},
        'standard',
        0,
        false
      ),
      (
        ${firstCustomTagId},
        ${ownerId},
        ${populatedCategoryId},
        'Alpha custom cue fixture',
        ${firstCustomTag.slug},
        'custom',
        20,
        true
      ),
      (
        ${secondCustomTagId},
        ${ownerId},
        null,
        'Zulu custom cue fixture',
        ${secondCustomTag.slug},
        'custom',
        10,
        true
      ),
      (
        ${foreignCustomTagId},
        ${otherUserId},
        null,
        'Foreign custom cue fixture',
        ${fixturePrefix + "foreign-custom-cue"},
        'custom',
        0,
        true
      ),
      (
        ${inactiveCustomTagId},
        ${ownerId},
        null,
        'Inactive custom cue fixture',
        ${fixturePrefix + "inactive-custom-cue"},
        'custom',
        0,
        false
      )
  `;
  await sql`
    insert into status_tags (id, name, slug, sort_order, active)
    values
      (${earlyStatusId}, 'Alpha status fixture', ${earlyStatus.slug}, 10, true),
      (${laterStatusId}, 'Zulu status fixture', ${laterStatus.slug}, 20, true),
      (${inactiveStatusId}, 'Inactive status fixture', ${fixturePrefix + "inactive-status"}, 0, false)
  `;
}

async function clearFixture(sql: Sql): Promise<void> {
  await sql`
    delete from tags
    where id in (
      ${inactiveCategoryTagId},
      ${firstStandardTagId},
      ${secondStandardTagId},
      ${uncategorizedTagId},
      ${inactiveStandardTagId},
      ${firstCustomTagId},
      ${secondCustomTagId},
      ${foreignCustomTagId},
      ${inactiveCustomTagId}
    )
  `;
  await sql`delete from users where id in (${ownerId}, ${otherUserId})`;
  await sql`
    delete from training_methods
    where id in (${earlyMethodId}, ${laterMethodId}, ${inactiveMethodId})
  `;
  await sql`
    delete from status_tags
    where id in (${earlyStatusId}, ${laterStatusId}, ${inactiveStatusId})
  `;
  await sql`
    delete from tag_categories
    where id in (${populatedCategoryId}, ${emptyCategoryId}, ${inactiveCategoryId})
  `;
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
