import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphResponse } from "@/data";
import type { PhysicsSimulation } from "./network-physics";
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

  it("commits simulation coordinates without reconciling the React tree per frame", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    renderGraph({ onRender });

    const drillElement = await screen.findByRole("button", { name: "Open drill Rear kick return" });
    await waitFor(() => expect(mocks.runNetworkSimulation).toHaveBeenCalled());

    const [simulation, commitFrame] = mocks.runNetworkSimulation.mock.lastCall as unknown as [
      PhysicsSimulation,
      (current: PhysicsSimulation) => void,
    ];
    const drillNode = simulation.nodes.find((node) => node.id === `drill:${drillId}`);
    const drillLink = simulation.links.find(
      (link) => link.source.id === `drill:${drillId}` || link.target.id === `drill:${drillId}`,
    );
    expect(drillNode).toBeDefined();
    expect(drillLink).toBeDefined();

    const reactCommitCount = onRender.mock.calls.length;
    const fullCoolingRunFrameCount = 244;
    for (let frame = 0; frame < fullCoolingRunFrameCount; frame += 1) {
      act(() => {
        drillNode!.x += 0.25;
        drillNode!.y -= 0.125;
        commitFrame(simulation);
      });
    }

    expect(drillElement).toHaveAttribute(
      "transform",
      `translate(${drillNode!.x}, ${drillNode!.y})`,
    );
    const edgeElement = document.querySelector<SVGLineElement>(
      `[data-link-id="${drillLink!.id}"]`,
    );
    expect(edgeElement).toHaveAttribute("x1", String(drillLink!.source.x));
    expect(edgeElement).toHaveAttribute("y1", String(drillLink!.source.y));
    expect(edgeElement).toHaveAttribute("x2", String(drillLink!.target.x));
    expect(edgeElement).toHaveAttribute("y2", String(drillLink!.target.y));
    expect(onRender).toHaveBeenCalledTimes(reactCommitCount);
  });

  it("ignores stale frame commits after replacing the topology or unmounting", async () => {
    const onDrillSelect = vi.fn();
    const onMethodSelect = vi.fn();
    const view = renderGraph({ onDrillSelect, onMethodSelect });

    const initialDrillElement = await screen.findByRole("button", {
      name: "Open drill Rear kick return",
    });
    const removedLayerElement = screen.getByText("Clinch entry").closest<SVGGElement>(
      ".network-force-label-node",
    );
    expect(removedLayerElement).not.toBeNull();
    await waitFor(() => expect(mocks.runNetworkSimulation).toHaveBeenCalledTimes(1));

    const [staleSimulation, staleCommitFrame] = mocks.runNetworkSimulation.mock.calls[0] as unknown as [
      PhysicsSimulation,
      (current: PhysicsSimulation) => void,
    ];
    const staleDrillNode = staleSimulation.nodes.find((node) => node.id === `drill:${drillId}`)!;
    const staleLayerNode = staleSimulation.nodes.find((node) => node.id === "tag:clinch-entry")!;
    const replacementGraph: GraphResponse = {
      ...graph,
      nodes: graph.nodes.filter((node) => node.id !== "tag:clinch-entry"),
      edges: graph.edges.filter((edge) => edge.id !== "tag:clinch-entry:drill"),
    };

    view.rerender(
      <NetworkForceGraph
        active
        graph={replacementGraph}
        badgeByIconKey={{}}
        focusedMethodSlugs={[]}
        visualState={visualState}
        onMethodSelect={onMethodSelect}
        onDrillSelect={onDrillSelect}
      />,
    );
    await waitFor(() => expect(mocks.runNetworkSimulation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Clinch entry")).not.toBeInTheDocument());

    const currentDrillElement = screen.getByRole("button", { name: "Open drill Rear kick return" });
    expect(currentDrillElement).toBe(initialDrillElement);
    const [currentSimulation, currentCommitFrame] = mocks.runNetworkSimulation.mock.calls[1] as unknown as [
      PhysicsSimulation,
      (current: PhysicsSimulation) => void,
    ];
    const currentDrillNode = currentSimulation.nodes.find((node) => node.id === `drill:${drillId}`)!;
    act(() => {
      currentDrillNode.x += 23;
      currentDrillNode.y -= 11;
      currentCommitFrame(currentSimulation);
    });
    const currentTransform = currentDrillElement.getAttribute("transform");
    const removedTransform = removedLayerElement!.getAttribute("transform");

    act(() => {
      staleDrillNode.x -= 500;
      staleLayerNode.y += 500;
      staleCommitFrame(staleSimulation);
    });
    expect(currentDrillElement).toHaveAttribute("transform", currentTransform);
    expect(removedLayerElement).toHaveAttribute("transform", removedTransform);

    view.unmount();
    act(() => {
      currentDrillNode.x += 500;
      staleLayerNode.y += 500;
      currentCommitFrame(currentSimulation);
      staleCommitFrame(staleSimulation);
    });
    expect(currentDrillElement).toHaveAttribute("transform", currentTransform);
    expect(removedLayerElement).toHaveAttribute("transform", removedTransform);
  });
});

function renderGraph({
  focusedMethodSlugs = [],
  onDrillSelect = vi.fn(),
  onMethodSelect = vi.fn(),
  onRender,
}: {
  focusedMethodSlugs?: string[];
  onDrillSelect?: (drillId: string) => void;
  onMethodSelect?: (slug: string | undefined) => void;
  onRender?: ProfilerOnRenderCallback;
} = {}) {
  const component = (
    <NetworkForceGraph
      active
      graph={graph}
      badgeByIconKey={{}}
      focusedMethodSlugs={focusedMethodSlugs}
      visualState={visualState}
      onMethodSelect={onMethodSelect}
      onDrillSelect={onDrillSelect}
    />
  );

  return render(
    onRender
      ? <Profiler id="network-force-graph" onRender={onRender}>{component}</Profiler>
      : component,
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
