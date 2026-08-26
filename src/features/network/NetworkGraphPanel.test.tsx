import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphOptions, GraphResponse } from "@/data";
import { defaultNetworkLayerOptions, emptyNetworkFilters } from "./types";

const mocks = vi.hoisted(() => ({
  getDrill: vi.fn(),
}));

vi.mock("@/data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/data")>();
  return { ...original, getDrill: mocks.getDrill };
});
vi.mock("./NetworkForceGraph", () => ({
  NetworkForceGraph: ({ active, onDrillSelect }: {
    active: boolean;
    onDrillSelect: (id: string) => void;
  }) => (
    <div data-testid="force-graph" data-active={String(active)}>
      <button type="button" onClick={() => onDrillSelect(drillId)}>Open fixture drill</button>
    </div>
  ),
}));
vi.mock("./NetworkControlsSheet", () => ({
  NetworkControlsSheet: ({ open }: { open: boolean }) => (
    <div data-testid="controls-sheet" data-open={String(open)} />
  ),
}));
vi.mock("@/features/drills/DrillDetailSheet", () => ({
  DrillDetailSheet: ({ open }: { open: boolean }) => (
    <div data-testid="detail-sheet" data-open={String(open)} />
  ),
}));

import { NetworkGraphPanel } from "./NetworkGraphPanel";

const drillId = "00000000-0000-4000-8000-000000000001";
const graph = {
  nodes: [
    {
      id: "method:pad-work",
      entityId: "00000000-0000-4000-8000-000000000002",
      type: "trainingMethod",
      label: "Pad Work",
      slug: "pad-work",
      active: false,
      matched: false,
      selected: false,
      iconKey: "pad-work",
    },
    {
      id: `drill:${drillId}`,
      entityId: drillId,
      type: "drill",
      label: "Fixture drill",
      active: false,
      matched: false,
      selected: false,
    },
  ],
  edges: [],
  filters: emptyNetworkFilters,
  options: defaultNetworkLayerOptions,
} as GraphResponse;

describe("NetworkGraphPanel hidden lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getDrill.mockResolvedValue({
      id: drillId,
      title: "Fixture drill",
      summary: "",
      notes: null,
      steps: [],
      trainingMethods: [],
      tags: [],
      customTags: [],
      statusTags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("closes every portaled surface when Network becomes inactive", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness active />);

    await user.click(screen.getByRole("button", { name: "Network controls" }));
    await user.click(screen.getByRole("button", { name: "Search network" }));
    await user.click(screen.getByRole("button", { name: "Open fixture drill" }));

    expect(screen.getByTestId("controls-sheet")).toHaveAttribute("data-open", "true");
    expect(screen.getByRole("textbox", { name: "Search keyword" })).toBeInTheDocument();
    expect(screen.getByTestId("detail-sheet")).toHaveAttribute("data-open", "true");

    rerender(<Harness active={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("controls-sheet")).toHaveAttribute("data-open", "false");
      expect(screen.queryByRole("textbox", { name: "Search keyword" })).not.toBeInTheDocument();
      expect(screen.queryByTestId("detail-sheet")).not.toBeInTheDocument();
      expect(screen.getByTestId("force-graph")).toHaveAttribute("data-active", "false");
    });
  });
});

function Harness({ active }: { active: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [filters, setFilters] = useState(emptyNetworkFilters);
  const [layerOptions, setLayerOptions] = useState<GraphOptions>(defaultNetworkLayerOptions);

  return (
    <NetworkGraphPanel
      active={active}
      graph={graph}
      filters={filters}
      effectiveFilters={filters}
      layerOptions={layerOptions}
      taxonomyLoading={false}
      previewKeyword=""
      searchOpen={searchOpen}
      searchDraft={searchDraft}
      refreshing={false}
      onRetry={() => undefined}
      onSearchOpenChange={setSearchOpen}
      onSearchDraftChange={setSearchDraft}
      onUpdateFilters={(updater) => setFilters((current) => updater(current))}
      onLayerOptionsChange={setLayerOptions}
      onRetryTaxonomy={() => undefined}
    />
  );
}
