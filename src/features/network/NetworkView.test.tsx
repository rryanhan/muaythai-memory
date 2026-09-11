import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphResponse, TaxonomyResponse } from "@/data/types";
import { NetworkView } from "./NetworkView";

const mocks = vi.hoisted(() => ({
  getGraph: vi.fn(),
  getTaxonomy: vi.fn(),
}));

vi.mock("@/data/graph", () => ({
  getGraph: mocks.getGraph,
}));

vi.mock("@/data/taxonomy", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));

vi.mock("./NetworkGraphPanel", () => ({
  NetworkGraphPanel: ({ taxonomy }: { taxonomy?: TaxonomyResponse }) => (
    <p>{taxonomy?.trainingMethods[0]?.name ?? "No taxonomy"}</p>
  ),
}));

vi.mock("./NetworkStates", () => ({
  NetworkGraphLoading: () => <p>Loading graph</p>,
  NetworkStatePanel: ({ body }: { body: string }) => <p>{body}</p>,
}));

beforeEach(() => {
  mocks.getGraph.mockReset();
  mocks.getTaxonomy.mockReset();
});

describe("NetworkView initial data", () => {
  it("uses server-provided graph and taxonomy without repeating either API request", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NetworkView
          active
          initialGraph={graph}
          initialTaxonomy={taxonomy}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Boxing")).toBeVisible();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.getGraph).not.toHaveBeenCalled();
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();
  });
});

const taxonomy: TaxonomyResponse = {
  trainingMethods: [{
    id: "11111111-1111-4111-8111-111111111111",
    name: "Boxing",
    slug: "boxing",
    iconKey: "boxing",
    sortOrder: 1,
  }],
  tagCategories: [],
  standardTags: [],
  customTags: [],
  statusTags: [],
};

const graph: GraphResponse = {
  nodes: [],
  edges: [],
  filters: {
    keywords: [],
    methodSlugs: [],
    tagSlugs: [],
    statusTagSlugs: [],
    tagMode: "all",
    statusMode: "all",
  },
  options: {
    showTags: false,
    showCustomTags: false,
    showStatusTags: false,
  },
};
