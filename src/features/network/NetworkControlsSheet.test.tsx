import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphOptions, TaxonomyResponse } from "@/data/types";
import { taxonomyQueryKey } from "@/features/shared/query-keys";
import { defaultNetworkLayerOptions, emptyNetworkFilters, type NetworkFilters } from "./types";

const mocks = vi.hoisted(() => ({
  getTaxonomy: vi.fn(),
  onTaxonomyLoaded: vi.fn(),
}));

vi.mock("@/data/taxonomy", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));

import { NetworkControlsSheet } from "./NetworkControlsSheet";

beforeEach(() => {
  mocks.getTaxonomy.mockReset();
  mocks.onTaxonomyLoaded.mockReset();
});

describe("NetworkControlsSheet taxonomy loading", () => {
  it("keeps controls operable without requesting or seeding taxonomy", () => {
    const { queryClient } = renderControls();

    expect(mocks.getTaxonomy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(taxonomyQueryKey)).toBeUndefined();

    const tagLayerToggle = screen.getByRole("checkbox", { name: "Show tag nodes" });
    fireEvent.click(tagLayerToggle);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search tags" }), {
      target: { value: "clinch" },
    });

    expect(tagLayerToggle).toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Search tags" })).toHaveValue("clinch");
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(taxonomyQueryKey)).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));

    expect(tagLayerToggle).not.toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Search tags" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Select tags" })).toHaveAttribute("aria-expanded", "false");
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();
  });

  it("requests, publishes, and caches the complete taxonomy only after tag selection opens", async () => {
    const taxonomyRequest = createDeferred<TaxonomyResponse>();
    mocks.getTaxonomy.mockReturnValueOnce(taxonomyRequest.promise);
    const { queryClient } = renderControls();

    expect(mocks.getTaxonomy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Select tags" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Loading tags");
    expect(mocks.getTaxonomy).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(taxonomyQueryKey)).toBeUndefined();
    const requestOptions = mocks.getTaxonomy.mock.calls[0]?.[0];
    expect(requestOptions?.requestInit?.signal).toBeInstanceOf(AbortSignal);

    await act(async () => {
      taxonomyRequest.resolve(taxonomy);
      await taxonomyRequest.promise;
    });

    expect(await screen.findByRole("button", { name: "Clinch Entry" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Favourite" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Wall Work" })).toBeVisible();
    expect(queryClient.getQueryData(taxonomyQueryKey)).toEqual(taxonomy);
    await waitFor(() => expect(mocks.onTaxonomyLoaded).toHaveBeenCalledWith(taxonomy));

    fireEvent.click(screen.getByRole("button", { name: "Clinch Entry" }));
    expect(screen.getByRole("button", { name: "1 selected" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Clinch Entry" })).toHaveAttribute("data-selected", "true");
  });

  it("reuses a fresh complete taxonomy from the shared cache", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(taxonomyQueryKey, taxonomy);
    renderControls({ queryClient });

    await waitFor(() => expect(mocks.onTaxonomyLoaded).toHaveBeenCalledWith(taxonomy));
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Select tags" }));

    expect(screen.getByRole("button", { name: "Clinch Entry" })).toBeVisible();
    expect(screen.queryByText("Loading tags")).not.toBeInTheDocument();
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(taxonomyQueryKey)).toEqual(taxonomy);
  });

  it("retries a failed on-demand request and publishes the recovered taxonomy", async () => {
    mocks.getTaxonomy
      .mockRejectedValueOnce(new Error("Taxonomy unavailable"))
      .mockResolvedValueOnce(taxonomy);
    const { queryClient } = renderControls();

    fireEvent.click(screen.getByRole("button", { name: "Select tags" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Taxonomy unavailable");
    expect(queryClient.getQueryData(taxonomyQueryKey)).toBeUndefined();
    expect(mocks.getTaxonomy).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("button", { name: "Clinch Entry" })).toBeVisible();
    expect(mocks.getTaxonomy).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(taxonomyQueryKey)).toEqual(taxonomy);
    await waitFor(() => expect(mocks.onTaxonomyLoaded).toHaveBeenCalledWith(taxonomy));
  });
});

function renderControls({ queryClient = createQueryClient() }: { queryClient?: QueryClient } = {}) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ControlsHarness />
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}

function ControlsHarness() {
  const [open, setOpen] = useState(true);
  const [filters, setFilters] = useState<NetworkFilters>(emptyNetworkFilters);
  const [layerOptions, setLayerOptions] = useState<GraphOptions>(defaultNetworkLayerOptions);
  const [tagSearch, setTagSearch] = useState("");
  const [tagSelectOpen, setTagSelectOpen] = useState(false);

  return (
    <NetworkControlsSheet
      open={open}
      onOpenChange={setOpen}
      filters={filters}
      layerOptions={layerOptions}
      tagSearch={tagSearch}
      tagSelectOpen={tagSelectOpen}
      onTagSearchChange={setTagSearch}
      onTagSelectOpenChange={setTagSelectOpen}
      onUpdateFilters={(updater) => setFilters((current) => updater(current))}
      onLayerOptionsChange={setLayerOptions}
      onTaxonomyLoaded={mocks.onTaxonomyLoaded}
    />
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

const category = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Clinch",
  slug: "clinch",
};

const standardTag = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Clinch Entry",
  slug: "clinch-entry",
  kind: "standard" as const,
  sortOrder: 1,
  category,
};

const taxonomy: TaxonomyResponse = {
  trainingMethods: [{
    id: "33333333-3333-4333-8333-333333333333",
    name: "Sparring",
    slug: "sparring",
    iconKey: "sparring",
    sortOrder: 1,
  }],
  tagCategories: [{ ...category, sortOrder: 1, tags: [standardTag] }],
  standardTags: [standardTag],
  customTags: [{
    id: "44444444-4444-4444-8444-444444444444",
    name: "Wall Work",
    slug: "wall-work",
    kind: "custom",
    sortOrder: 1,
    category: null,
  }],
  statusTags: [{
    id: "55555555-5555-4555-8555-555555555555",
    name: "Starred",
    slug: "starred",
    sortOrder: 10,
  }],
};
