import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: { execute: mocks.execute },
}));

import { getTaxonomy } from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.execute.mockReset();
});

describe("getTaxonomy", () => {
  it("loads the complete taxonomy in one ordered statement by default", async () => {
    mocks.execute.mockResolvedValueOnce([taxonomySnapshot()]);

    const taxonomy = await getTaxonomy(userId);

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(taxonomy).toEqual(expectedTaxonomy({
      includeTagCategories: true,
      includeStandardTags: true,
      includeCustomTags: true,
      includeStatusTags: true,
    }));

    const { normalizedSql, params } = compiledQuery();
    expect(countOccurrences(normalizedSql, "select jsonb_agg(")).toBe(5);
    expect(normalizedSql).toContain(
      `from "training_methods" where "training_methods"."active" = true`,
    );
    expect(normalizedSql).toContain(
      `order by "training_methods"."sort_order", "training_methods"."name"`,
    );
    expect(normalizedSql).toContain(
      `from "tag_categories" where "tag_categories"."active" = true`,
    );
    expect(normalizedSql).toContain(`"tags"."kind" = 'standard'`);
    expect(normalizedSql).toContain(`"tags"."user_id" is null`);
    expect(normalizedSql).toContain(`"tags"."kind" = 'custom'`);
    expect(normalizedSql).toContain(`"tags"."user_id" = $1`);
    expect(normalizedSql).toContain(
      `from "status_tags" where "status_tags"."active" = true`,
    );
    expect(params).toEqual([userId]);
  });

  it.each(includeOptionCases())(
    "preserves the $label include-option combination",
    async ({ label, ...options }) => {
      mocks.execute.mockResolvedValueOnce([taxonomySnapshot(options)]);

      await expect(getTaxonomy(userId, options)).resolves.toEqual(expectedTaxonomy(options));
      expect(mocks.execute, label).toHaveBeenCalledOnce();

      const { normalizedSql, params } = compiledQuery();
      expect(countOccurrences(normalizedSql, "select jsonb_agg(")).toBe(
        1
          + Number(options.includeTagCategories)
          + Number(options.includeStandardTags)
          + Number(options.includeCustomTags)
          + Number(options.includeStatusTags),
      );
      expect(normalizedSql.includes(
        `from "tag_categories" where "tag_categories"."active" = true`,
      )).toBe(options.includeTagCategories);
      expect(normalizedSql.includes(`"tags"."kind" = 'standard'`)).toBe(
        options.includeStandardTags,
      );
      expect(normalizedSql.includes(`"tags"."kind" = 'custom'`)).toBe(
        options.includeCustomTags,
      );
      expect(normalizedSql.includes(
        `from "status_tags" where "status_tags"."active" = true`,
      )).toBe(options.includeStatusTags);
      expect(params).toEqual(options.includeCustomTags ? [userId] : []);
    },
  );
});

const methodRow = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Boxing",
  slug: "boxing",
  iconKey: "boxing",
  sortOrder: 1,
};

const categoryRow = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Weapon",
  slug: "weapon",
  sortOrder: 1,
};

const standardTagRow = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Jab",
  slug: "jab",
  kind: "standard",
  sortOrder: 1,
  categoryId: categoryRow.id,
  categoryName: categoryRow.name,
  categorySlug: categoryRow.slug,
};

const standardTag = {
  id: standardTagRow.id,
  name: standardTagRow.name,
  slug: standardTagRow.slug,
  kind: "standard" as const,
  sortOrder: standardTagRow.sortOrder,
  category: {
    id: categoryRow.id,
    name: categoryRow.name,
    slug: categoryRow.slug,
  },
};

const customTagRow = {
  ...standardTagRow,
  id: "55555555-5555-4555-8555-555555555555",
  name: "Sharp",
  slug: "sharp",
  kind: "custom",
  categoryId: null,
  categoryName: null,
  categorySlug: null,
};

const customTag = {
  id: customTagRow.id,
  name: customTagRow.name,
  slug: customTagRow.slug,
  kind: "custom" as const,
  sortOrder: customTagRow.sortOrder,
  category: null,
};

const statusRow = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "Starred",
  slug: "starred",
  sortOrder: 1,
};

type IncludeOptions = {
  includeTagCategories: boolean;
  includeStandardTags: boolean;
  includeCustomTags: boolean;
  includeStatusTags: boolean;
};

function taxonomySnapshot(options: IncludeOptions = {
  includeTagCategories: true,
  includeStandardTags: true,
  includeCustomTags: true,
  includeStatusTags: true,
}) {
  return {
    methodRows: [methodRow],
    categoryRows: options.includeTagCategories ? [categoryRow] : [],
    standardTagRows: options.includeStandardTags ? [standardTagRow] : [],
    customTagRows: options.includeCustomTags ? [customTagRow] : [],
    statusRows: options.includeStatusTags ? [statusRow] : [],
  };
}

function expectedTaxonomy(options: IncludeOptions) {
  return {
    trainingMethods: [methodRow],
    tagCategories: options.includeTagCategories
      ? [{
          ...categoryRow,
          tags: options.includeStandardTags ? [standardTag] : [],
        }]
      : [],
    standardTags: options.includeStandardTags ? [standardTag] : [],
    customTags: options.includeCustomTags ? [customTag] : [],
    statusTags: options.includeStatusTags ? [statusRow] : [],
  };
}

function includeOptionCases(): Array<IncludeOptions & { label: string }> {
  return Array.from({ length: 16 }, (_, mask) => {
    const options = {
      includeTagCategories: Boolean(mask & 1),
      includeStandardTags: Boolean(mask & 2),
      includeCustomTags: Boolean(mask & 4),
      includeStatusTags: Boolean(mask & 8),
    };
    return {
      label: Object.entries(options)
        .filter(([, included]) => included)
        .map(([name]) => name.replace("include", ""))
        .join("+") || "methods-only",
      ...options,
    };
  });
}

function compiledQuery() {
  const query = mocks.execute.mock.calls[0]?.[0];
  if (!query) throw new Error("Expected a taxonomy SQL statement.");
  const compiled = new PgDialect().sqlToQuery(query);
  return {
    normalizedSql: compiled.sql.replace(/\s+/g, " ").trim(),
    params: compiled.params,
  };
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
