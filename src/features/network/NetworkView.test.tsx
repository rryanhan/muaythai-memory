import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphResponse, TaxonomyResponse } from "@/data/types";
import type { NetworkFilters } from "./types";
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
  NetworkGraphPanel: ({
    taxonomy,
    graph,
    searchOpen,
    searchDraft,
    onSearchOpenChange,
    onSearchDraftChange,
    onUpdateFilters,
  }: {
    taxonomy?: TaxonomyResponse;
    graph: GraphResponse;
    searchOpen: boolean;
    searchDraft: string;
    onSearchOpenChange: (open: boolean) => void;
    onSearchDraftChange: (value: string) => void;
    onUpdateFilters: (updater: (current: NetworkFilters) => NetworkFilters) => void;
  }) => (
    <>
      <p>{taxonomy?.trainingMethods[0]?.name ?? "No taxonomy"}</p>
      <p data-testid="graph-keywords">{graph.filters.keywords.join(",")}</p>
      <button type="button" aria-label="Search network" onClick={() => onSearchOpenChange(!searchOpen)} />
      {searchOpen && (
        <form
          aria-label="Network keyword search"
          onSubmit={(event) => {
            event.preventDefault();
            const keyword = searchDraft.trim().replace(/\s+/g, " ").toLowerCase();
            if (keyword) {
              onUpdateFilters((current) => ({
                ...current,
                keywords: [...current.keywords, keyword],
              }));
            }
            onSearchDraftChange("");
            onSearchOpenChange(false);
          }}
        >
          <input
            aria-label="Search keyword"
            value={searchDraft}
            onChange={(event) => onSearchDraftChange(event.target.value)}
          />
        </form>
      )}
    </>
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

afterEach(() => {
  vi.useRealTimers();
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

  it("waits for rapid preview typing to settle before requesting a graph", async () => {
    vi.useFakeTimers();
    mocks.getGraph.mockResolvedValue(graph);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NetworkView active initialGraph={graph} initialTaxonomy={taxonomy} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search network" }));
    const searchInput = screen.getByRole("textbox", { name: "Search keyword" });
    fireEvent.change(searchInput, { target: { value: "m" } });
    fireEvent.change(searchInput, { target: { value: "mu" } });
    fireEvent.change(searchInput, { target: { value: "muay" } });

    expect(searchInput).toHaveValue("muay");
    expect(mocks.getGraph).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(mocks.getGraph).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.getGraph).toHaveBeenCalledOnce();
    expect(mocks.getGraph.mock.calls[0]?.[0]).toMatchObject({ keywords: ["muay"] });
  });

  it("commits the current draft immediately and cancels its pending preview", async () => {
    vi.useFakeTimers();
    mocks.getGraph.mockResolvedValue(filteredGraph);
    renderNetwork();

    fireEvent.click(screen.getByRole("button", { name: "Search network" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search keyword" }), {
      target: { value: "muay" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Network keyword search" }));

    expect(screen.queryByRole("textbox", { name: "Search keyword" })).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.getGraph).toHaveBeenCalledOnce();
    expect(mocks.getGraph.mock.calls[0]?.[0]).toMatchObject({ keywords: ["muay"] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.getGraph).toHaveBeenCalledOnce();
  });

  it("does not repeat a settled preview request when that keyword is committed", async () => {
    vi.useFakeTimers();
    mocks.getGraph.mockResolvedValue(filteredGraph);
    renderNetwork();

    fireEvent.click(screen.getByRole("button", { name: "Search network" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search keyword" }), {
      target: { value: "muay" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.getGraph).toHaveBeenCalledOnce();

    fireEvent.submit(screen.getByRole("form", { name: "Network keyword search" }));
    expect(mocks.getGraph).toHaveBeenCalledOnce();
  });

  it("returns to the initial graph immediately when a preview is cleared", async () => {
    vi.useFakeTimers();
    mocks.getGraph.mockResolvedValue(filteredGraph);
    renderNetwork();

    fireEvent.click(screen.getByRole("button", { name: "Search network" }));
    const searchInput = screen.getByRole("textbox", { name: "Search keyword" });
    fireEvent.change(searchInput, { target: { value: "muay" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByTestId("graph-keywords")).toHaveTextContent("muay");

    fireEvent.change(searchInput, { target: { value: "" } });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("graph-keywords")).toBeEmptyDOMElement();
    expect(mocks.getGraph).toHaveBeenCalledOnce();
  });
});

function renderNetwork() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NetworkView active initialGraph={graph} initialTaxonomy={taxonomy} />
    </QueryClientProvider>,
  );
}

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

const filteredGraph: GraphResponse = {
  ...graph,
  filters: {
    ...graph.filters,
    keywords: ["muay"],
  },
};
