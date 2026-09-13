import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphResponse } from "@/data";
import type { NetworkGraphVisualState } from "./types";

const mocks = vi.hoisted(() => ({
  runNetworkSimulation: vi.fn(),
}));

vi.mock("d3", async (importOriginal) => {
  const original = await importOriginal<typeof import("d3")>();

  function createSelection() {
    const selection = {
      call: vi.fn(),
      on: vi.fn(),
    };
    selection.call.mockReturnValue(selection);
    selection.on.mockReturnValue(selection);
    return selection;
  }

  function createZoomBehavior() {
    const behavior = {
      extent: vi.fn(),
      filter: vi.fn(),
      on: vi.fn(),
      scaleExtent: vi.fn(),
      transform: vi.fn(),
      translateExtent: vi.fn(),
    };
    behavior.extent.mockReturnValue(behavior);
    behavior.filter.mockReturnValue(behavior);
    behavior.on.mockReturnValue(behavior);
    behavior.scaleExtent.mockReturnValue(behavior);
    behavior.translateExtent.mockReturnValue(behavior);
    return behavior;
  }

  return {
    ...original,
    select: vi.fn(() => createSelection()),
    zoom: vi.fn(() => createZoomBehavior()),
  };
});

vi.mock("./network-physics", async (importOriginal) => ({
  ...await importOriginal<typeof import("./network-physics")>(),
  runNetworkSimulation: mocks.runNetworkSimulation,
}));

import { NetworkForceGraph } from "./NetworkForceGraph";

describe("NetworkForceGraph accessible activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 844,
      height: 844,
      left: 0,
      right: 390,
      top: 0,
      width: 390,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes drill and method nodes as named buttons with keyboard activation", async () => {
    const onDrillSelect = vi.fn();
    const onMethodSelect = vi.fn();
    renderGraph({ onDrillSelect, onMethodSelect });

    const drill = await screen.findByRole("button", { name: "Open drill Rear kick return" });
    const method = screen.getByRole("button", { name: "Filter by training method Pad Work" });

    expect(drill).toHaveAttribute("tabindex", "0");
    expect(method).toHaveAttribute("tabindex", "0");
    expect(method).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(method, { key: "ArrowDown" });
    expect(onMethodSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(method, { key: "Enter" });
    fireEvent.keyDown(drill, { key: " " });

    expect(onMethodSelect).toHaveBeenCalledOnce();
    expect(onMethodSelect).toHaveBeenCalledWith("pad-work");
    expect(onDrillSelect).toHaveBeenCalledOnce();
    expect(onDrillSelect).toHaveBeenCalledWith(drillId);
  });

  it("announces the selected method and keeps non-actionable layer nodes out of the tab order", async () => {
    renderGraph({ focusedMethodSlugs: ["pad-work"] });

    const method = await screen.findByRole("button", { name: "Filter by training method Pad Work" });
    expect(method).toHaveAttribute("aria-pressed", "true");
    method.focus();
    expect(method).toHaveFocus();

    await waitFor(() => expect(screen.getByText("Clinch entry")).toBeInTheDocument());
    const layerNode = screen.getByText("Clinch entry").closest(".network-force-label-node");
    expect(layerNode).not.toHaveAttribute("role");
    expect(layerNode).not.toHaveAttribute("tabindex");
  });

  it("handles synthetic clicks without duplicating pointer activation", async () => {
    const onDrillSelect = vi.fn();
    const onMethodSelect = vi.fn();
    renderGraph({ onDrillSelect, onMethodSelect });

    const drill = await screen.findByRole("button", { name: "Open drill Rear kick return" });
    const method = screen.getByRole("button", { name: "Filter by training method Pad Work" });

    fireEvent.click(method);
    fireEvent.click(drill);
    expect(onMethodSelect).toHaveBeenCalledOnce();
    expect(onDrillSelect).toHaveBeenCalledOnce();

    fireEvent.click(method, { detail: 1 });
    fireEvent.click(drill, { detail: 1 });
    expect(onMethodSelect).toHaveBeenCalledOnce();
    expect(onDrillSelect).toHaveBeenCalledOnce();
  });
});

function renderGraph({
  focusedMethodSlugs = [],
  onDrillSelect = vi.fn(),
  onMethodSelect = vi.fn(),
}: {
  focusedMethodSlugs?: string[];
  onDrillSelect?: (drillId: string) => void;
  onMethodSelect?: (slug: string | undefined) => void;
} = {}) {
  return render(
    <NetworkForceGraph
      active
      graph={graph}
      badgeByIconKey={{}}
      focusedMethodSlugs={focusedMethodSlugs}
      visualState={visualState}
      onMethodSelect={onMethodSelect}
      onDrillSelect={onDrillSelect}
    />,
  );
}

const drillId = "00000000-0000-4000-8000-000000000001";

const graph: GraphResponse = {
  nodes: [
    {
      id: "method:pad-work",
      entityId: "00000000-0000-4000-8000-000000000002",
      type: "trainingMethod",
      label: "Pad Work",
      slug: "pad-work",
      iconKey: "pad-work",
      active: true,
      matched: true,
      selected: false,
    },
    {
      id: `drill:${drillId}`,
      entityId: drillId,
      type: "drill",
      label: "Rear kick return",
      active: true,
      matched: true,
      selected: false,
    },
    {
      id: "tag:clinch-entry",
      entityId: "00000000-0000-4000-8000-000000000003",
      type: "tag",
      label: "Clinch entry",
      slug: "clinch-entry",
      active: true,
      matched: true,
      selected: false,
    },
  ],
  edges: [
    {
      id: "method:pad-work:drill",
      from: "method:pad-work",
      to: `drill:${drillId}`,
      type: "method",
      active: true,
    },
    {
      id: "tag:clinch-entry:drill",
      from: "tag:clinch-entry",
      to: `drill:${drillId}`,
      type: "tag",
      active: true,
    },
  ],
  filters: {
    keywords: [],
    methodSlugs: [],
    tagSlugs: [],
    statusTagSlugs: [],
    tagMode: "all",
    statusMode: "all",
  },
  options: {
    showTags: true,
    showCustomTags: false,
    showStatusTags: false,
  },
};

const visualState: NetworkGraphVisualState = {
  canHighlight: false,
  activeNodeIds: new Set(graph.nodes.map((node) => node.id)),
  activeEdgeIds: new Set(graph.edges.map((edge) => edge.id)),
};
