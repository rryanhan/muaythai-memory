import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: { select: mocks.select },
}));

import { getTaxonomy } from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.select.mockReset();
});

describe("getTaxonomy", () => {
  it("loads the complete taxonomy by default", async () => {
    mocks.select
      .mockReturnValueOnce(queryReturning([methodRow]))
      .mockReturnValueOnce(queryReturning([categoryRow]))
      .mockReturnValueOnce(queryReturning([standardTagRow]))
      .mockReturnValueOnce(queryReturning([customTagRow]))
      .mockReturnValueOnce(queryReturning([statusRow]));

    const taxonomy = await getTaxonomy(userId);

    expect(mocks.select).toHaveBeenCalledTimes(5);
    expect(taxonomy.trainingMethods.map((method) => method.slug)).toEqual(["boxing"]);
    expect(taxonomy.tagCategories.map((category) => category.slug)).toEqual(["weapon"]);
    expect(taxonomy.standardTags.map((tag) => tag.slug)).toEqual(["jab"]);
    expect(taxonomy.customTags.map((tag) => tag.slug)).toEqual(["sharp"]);
    expect(taxonomy.statusTags.map((status) => status.slug)).toEqual(["starred"]);
  });

  it("skips taxonomy layers that the graph will not render", async () => {
    mocks.select.mockReturnValueOnce(queryReturning([methodRow]));

    const taxonomy = await getTaxonomy(userId, {
      includeTagCategories: false,
      includeStandardTags: false,
      includeCustomTags: false,
      includeStatusTags: false,
    });

    expect(mocks.select).toHaveBeenCalledOnce();
    expect(taxonomy).toEqual({
      trainingMethods: [methodRow],
      tagCategories: [],
      standardTags: [],
      customTags: [],
      statusTags: [],
    });
  });
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

const statusRow = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "Starred",
  slug: "starred",
  sortOrder: 1,
};

function queryReturning(rows: unknown[]) {
  const builder = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };
  builder.from.mockReturnValue(builder);
  builder.leftJoin.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.orderBy.mockResolvedValue(rows);
  return builder;
}
