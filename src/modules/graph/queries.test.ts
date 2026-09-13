import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillFilters, DrillListResponse } from "@/modules/drills/contracts";
import type { TaxonomyResponse } from "@/modules/taxonomy/contracts";

const mocks = vi.hoisted(() => ({
  getTaxonomy: vi.fn(),
  listDrills: vi.fn(),
}));

vi.mock("@/modules/taxonomy/queries", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));

vi.mock("@/modules/drills/queries", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/drills/queries")>();
  return {
    ...original,
    listDrills: mocks.listDrills,
  };
});

import { getInitialNetworkData, getMuayThaiGraph } from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.getTaxonomy.mockReset().mockResolvedValue(taxonomy);
  mocks.listDrills.mockReset().mockResolvedValue(drillList);
});

describe("network graph query planning", () => {
  it("loads only methods and drill-method relations for the default graph API request", async () => {
    const graph = await getMuayThaiGraph(userId);

    expect(mocks.getTaxonomy).toHaveBeenCalledWith(userId, {
      includeTagCategories: false,
      includeStandardTags: false,
      includeCustomTags: false,
      includeStatusTags: false,
    });
    expect(mocks.listDrills).toHaveBeenCalledWith(
      userId,
      {},
      { includeTags: false, includeStatusTags: false },
    );
    expect(graph.nodes.map((node) => node.type)).toEqual(["trainingMethod", "drill"]);
    expect(graph.edges.map((edge) => edge.type)).toEqual(["method"]);
  });

  it("loads visible taxonomy layers and their drill relations on demand", async () => {
    const graph = await getMuayThaiGraph(userId, {}, {
      showTags: true,
      showCustomTags: true,
      showStatusTags: true,
    });

    expect(mocks.getTaxonomy).toHaveBeenCalledWith(userId, {
      includeTagCategories: false,
      includeStandardTags: true,
      includeCustomTags: true,
      includeStatusTags: true,
    });
    expect(mocks.listDrills).toHaveBeenCalledWith(
      userId,
      {},
      { includeTags: true, includeStatusTags: true },
    );
    expect(new Set(graph.nodes.map((node) => node.type))).toEqual(new Set([
      "trainingMethod",
      "drill",
      "tag",
      "customTag",
      "statusTag",
    ]));
  });

  it("keeps unmatched drill nodes while marking only filter matches active", async () => {
    const secondMethod = {
      id: "77777777-7777-4777-8777-777777777777",
      name: "Sparring",
      slug: "sparring",
      iconKey: "sparring",
      sortOrder: 2,
    };
    mocks.getTaxonomy.mockResolvedValue({
      ...taxonomy,
      trainingMethods: [...taxonomy.trainingMethods, secondMethod],
    });
    mocks.listDrills.mockResolvedValue({
      ...drillList,
      drills: [
        ...drillList.drills,
        {
          ...drillList.drills[0],
          id: "88888888-8888-4888-8888-888888888888",
          title: "Sparring round",
          trainingMethods: [secondMethod],
        },
      ],
      total: 2,
    });

    const graph = await getMuayThaiGraph(userId, {
      methodSlugs: ["boxing"],
    });

    expect(mocks.listDrills).toHaveBeenCalledWith(
      userId,
      {},
      { includeTags: false, includeStatusTags: false },
    );
    const drillNodes = graph.nodes.filter((node) => node.type === "drill");
    expect(drillNodes).toHaveLength(2);
    expect(drillNodes.map((node) => ({ label: node.label, active: node.active }))).toEqual([
      { label: "Jab entry", active: true },
      { label: "Sparring round", active: false },
    ]);
    expect(graph.edges.filter((edge) => edge.type === "method")).toHaveLength(2);
  });

  it("hydrates associations required by hidden-layer filters", async () => {
    await getMuayThaiGraph(userId, { keywords: ["counter"] });
    await getMuayThaiGraph(userId, { tagSlugs: ["jab"] });
    await getMuayThaiGraph(userId, { statusTagSlugs: ["starred"] });

    expect(mocks.listDrills).toHaveBeenNthCalledWith(
      1,
      userId,
      {},
      { includeTags: true, includeStatusTags: true },
    );
    expect(mocks.listDrills).toHaveBeenNthCalledWith(
      2,
      userId,
      {},
      { includeTags: true, includeStatusTags: false },
    );
    expect(mocks.listDrills).toHaveBeenNthCalledWith(
      3,
      userId,
      {},
      { includeTags: false, includeStatusTags: true },
    );
  });

  it("hydrates the initial page with the selective default graph plan only", async () => {
    const initialData = await getInitialNetworkData(userId);

    expect(mocks.getTaxonomy).toHaveBeenCalledWith(userId, {
      includeTagCategories: false,
      includeStandardTags: false,
      includeCustomTags: false,
      includeStatusTags: false,
    });
    expect(mocks.listDrills).toHaveBeenCalledWith(
      userId,
      {},
      { includeTags: false, includeStatusTags: false },
    );
    expect(initialData).toEqual({ graph: expect.any(Object) });
    expect(initialData.graph.nodes.map((node) => node.type)).toEqual([
      "trainingMethod",
      "drill",
    ]);
  });
});

const emptyFilters: DrillFilters = {
  keywords: [],
  methodSlugs: [],
  tagSlugs: [],
  statusTagSlugs: [],
  tagMode: "all",
  statusMode: "all",
};

const taxonomy: TaxonomyResponse = {
  trainingMethods: [{
    id: "22222222-2222-4222-8222-222222222222",
    name: "Boxing",
    slug: "boxing",
    iconKey: "boxing",
    sortOrder: 1,
  }],
  tagCategories: [],
  standardTags: [{
    id: "33333333-3333-4333-8333-333333333333",
    name: "Jab",
    slug: "jab",
    kind: "standard",
    sortOrder: 1,
    category: null,
  }],
  customTags: [{
    id: "44444444-4444-4444-8444-444444444444",
    name: "Sharp",
    slug: "sharp",
    kind: "custom",
    sortOrder: 1,
    category: null,
  }],
  statusTags: [{
    id: "55555555-5555-4555-8555-555555555555",
    name: "Starred",
    slug: "starred",
    sortOrder: 1,
  }],
};

const now = new Date("2026-09-11T00:00:00Z");
const drillList: DrillListResponse = {
  drills: [{
    id: "66666666-6666-4666-8666-666666666666",
    title: "Jab entry",
    summary: "Step in behind the jab.",
    trainingMethods: taxonomy.trainingMethods,
    tags: taxonomy.standardTags,
    customTags: taxonomy.customTags,
    statusTags: taxonomy.statusTags,
    createdAt: now,
    updatedAt: now,
  }],
  total: 1,
  filters: emptyFilters,
};
