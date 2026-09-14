import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { zoomIdentity, type D3ZoomEvent, type ZoomTransform } from "d3";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphResponse } from "@/data";
import {
  getInitialZoomTransform,
  getLayoutSize,
  type PhysicsSimulation,
} from "./network-physics";
import type { NetworkGraphVisualState } from "./types";

const mocks = vi.hoisted(() => ({
  resizeListener: undefined as (() => void) | undefined,
  runNetworkSimulation: vi.fn(),
  viewportHeight: 844,
  viewportWidth: 390,
  zoomListener: undefined as ((
    event: D3ZoomEvent<SVGSVGElement, unknown>
  ) => void) | undefined,
}));

vi.mock("d3", async (importOriginal) => {
  const original = await importOriginal<typeof import("d3")>();

  function createSelection() {
    const selection = {
      call: vi.fn(),
      on: vi.fn(),
    };
    selection.call.mockImplementation((callback, ...args) => {
      if (typeof callback === "function") {
        callback(selection, ...args);
      }
      return selection;
    });
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
    behavior.on.mockImplementation((eventName, listener) => {
      if (eventName === "zoom") {
        mocks.zoomListener = listener;
      }
      return behavior;
    });
    behavior.scaleExtent.mockReturnValue(behavior);
    behavior.transform.mockImplementation((_selection, transform) => {
      mocks.zoomListener?.({ transform } as D3ZoomEvent<SVGSVGElement, unknown>);
    });
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
    mocks.resizeListener = undefined;
    mocks.viewportHeight = 844;
    mocks.viewportWidth = 390;
    mocks.zoomListener = undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(listener: ResizeObserverCallback) {
        mocks.resizeListener = () => listener([], this as unknown as ResizeObserver);
      }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      bottom: mocks.viewportHeight,
      height: mocks.viewportHeight,
      left: 0,
      right: mocks.viewportWidth,
      top: 0,
      width: mocks.viewportWidth,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
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

  it("commits camera pan and zoom frames without reconciling the React tree", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    renderGraph({ onRender });

    const drillElement = await screen.findByRole("button", { name: "Open drill Rear kick return" });
    await waitFor(() => expect(mocks.zoomListener).toBeTypeOf("function"));
    const cameraElement = document.querySelector<SVGGElement>(".network-force-camera");
    const drillVisual = drillElement.querySelector<SVGGElement>(".network-force-node-visual");
    expect(cameraElement).not.toBeNull();
    expect(drillVisual).not.toBeNull();

    const reactCommitCount = onRender.mock.calls.length;
    const panScale = 0.8;
    emitZoom(zoomIdentity.scale(panScale));
    const nodeVisualAttributeSpy = vi.spyOn(drillVisual!, "setAttribute");
    let finalTransform: ZoomTransform = zoomIdentity.scale(panScale);
    for (let frame = 0; frame < 100; frame += 1) {
      finalTransform = zoomIdentity
        .translate(frame * 0.75, frame * -0.375)
        .scale(panScale);
      emitZoom(finalTransform);
    }

    expect(cameraElement).toHaveAttribute("transform", finalTransform.toString());
    expect(nodeVisualAttributeSpy).not.toHaveBeenCalled();
    expect(onRender).toHaveBeenCalledTimes(reactCommitCount);

    finalTransform = zoomIdentity.translate(75, -37.5).scale(1.1);
    emitZoom(finalTransform);
    expect(drillVisual).toHaveAttribute(
      "transform",
      `scale(${expectedSemanticCompensation(finalTransform.k)})`,
    );
    expect(nodeVisualAttributeSpy).toHaveBeenCalledOnce();
    expect(onRender).toHaveBeenCalledTimes(reactCommitCount);
  });

  it("reconciles only once when each semantic zoom threshold is crossed", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    renderGraph({ onRender });

    const svg = await screen.findByLabelText("Muay Thai drill network graph");
    await waitFor(() => expect(mocks.zoomListener).toBeTypeOf("function"));
    expect(svg).toHaveAttribute("data-zoom-level", "near");
    const initialCommitCount = onRender.mock.calls.length;

    emitZoom(zoomIdentity.translate(10, 12).scale(0.61));
    expect(svg).toHaveAttribute("data-zoom-level", "far");
    expect(onRender).toHaveBeenCalledTimes(initialCommitCount + 1);

    emitZoom(zoomIdentity.translate(40, 52).scale(0.58));
    expect(svg).toHaveAttribute("data-zoom-level", "far");
    expect(onRender).toHaveBeenCalledTimes(initialCommitCount + 1);

    emitZoom(zoomIdentity.translate(22, 18).scale(0.63));
    expect(svg).toHaveAttribute("data-zoom-level", "near");
    expect(onRender).toHaveBeenCalledTimes(initialCommitCount + 2);
  });

  it("keeps D3 initial, reset, and resize transforms synchronized with the DOM", async () => {
    renderGraph();

    const svg = await screen.findByLabelText("Muay Thai drill network graph");
    const drill = await screen.findByRole("button", { name: "Open drill Rear kick return" });
    await waitFor(() => expect(mocks.zoomListener).toBeTypeOf("function"));
    const cameraElement = document.querySelector<SVGGElement>(".network-force-camera");
    const drillVisual = drill.querySelector<SVGGElement>(".network-force-node-visual");
    const initialViewport = { width: 390, height: 844 };
    const initialTransform = getInitialZoomTransform(
      initialViewport,
      getLayoutSize(initialViewport),
    );

    expect(cameraElement).toHaveAttribute("transform", initialTransform.toString());
    expect(drillVisual).toHaveAttribute("transform", "scale(1)");

    emitZoom(zoomIdentity.translate(32, -18).scale(0.58));
    expect(svg).toHaveAttribute("data-zoom-level", "far");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(cameraElement).toHaveAttribute("transform", initialTransform.toString());
    expect(drillVisual).toHaveAttribute("transform", "scale(1)");
    expect(svg).toHaveAttribute("data-zoom-level", "near");

    emitZoom(zoomIdentity.translate(-45, 27).scale(1.4));
    mocks.viewportWidth = 844;
    mocks.viewportHeight = 390;
    act(() => {
      mocks.resizeListener?.();
    });

    const resizedViewport = { width: 844, height: 390 };
    const resizedTransform = getInitialZoomTransform(
      resizedViewport,
      getLayoutSize(resizedViewport),
    );
    await waitFor(() => {
      expect(svg).toHaveAttribute("viewBox", "0 0 844 390");
      expect(cameraElement).toHaveAttribute("transform", resizedTransform.toString());
      expect(drillVisual).toHaveAttribute("transform", "scale(1)");
    });
  });

  it("gives newly mounted topology nodes the current semantic compensation", async () => {
    const onDrillSelect = vi.fn();
    const onMethodSelect = vi.fn();
    const view = renderGraph({ onDrillSelect, onMethodSelect });

    const initialDrill = await screen.findByRole("button", { name: "Open drill Rear kick return" });
    await waitFor(() => expect(mocks.zoomListener).toBeTypeOf("function"));
    const cameraElement = document.querySelector<SVGGElement>(".network-force-camera");
    const cameraTransform = zoomIdentity.translate(-35, 24).scale(1.4);
    emitZoom(cameraTransform);

    const initialVisual = initialDrill.querySelector<SVGGElement>(".network-force-node-visual");
    const currentCompensation = initialVisual?.getAttribute("transform");
    expect(currentCompensation).toBe(`scale(${expectedSemanticCompensation(cameraTransform.k)})`);

    const addedDrillId = "00000000-0000-4000-8000-000000000004";
    const expandedGraph: GraphResponse = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: `drill:${addedDrillId}`,
          entityId: addedDrillId,
          type: "drill",
          label: "Switch knee",
          active: true,
          matched: true,
          selected: false,
        },
      ],
    };
    const expandedVisualState: NetworkGraphVisualState = {
      ...visualState,
      activeNodeIds: new Set(expandedGraph.nodes.map((node) => node.id)),
    };

    view.rerender(
      <NetworkForceGraph
        active
        graph={expandedGraph}
        badgeByIconKey={{}}
        focusedMethodSlugs={[]}
        visualState={expandedVisualState}
        onMethodSelect={onMethodSelect}
        onDrillSelect={onDrillSelect}
      />,
    );

    const addedDrill = await screen.findByRole("button", { name: "Open drill Switch knee" });
    const addedVisual = addedDrill.querySelector<SVGGElement>(".network-force-node-visual");
    expect(cameraElement).toHaveAttribute("transform", cameraTransform.toString());
    expect(initialVisual).toHaveAttribute("transform", currentCompensation);
    expect(addedVisual).toHaveAttribute("transform", currentCompensation);
  });

  it("seeds replacement topology from the latest simulation coordinates", async () => {
    const onDrillSelect = vi.fn();
    const onMethodSelect = vi.fn();
    const view = renderGraph({ onDrillSelect, onMethodSelect });

    await screen.findByRole("button", { name: "Open drill Rear kick return" });
    await waitFor(() => expect(mocks.runNetworkSimulation).toHaveBeenCalledTimes(1));

    const [initialSimulation] = mocks.runNetworkSimulation.mock.calls[0] as unknown as [
      PhysicsSimulation,
    ];
    const initialDrillNode = initialSimulation.nodes.find(
      (node) => node.id === `drill:${drillId}`,
    )!;
    const latestPosition = {
      x: initialDrillNode.x + 137,
      y: initialDrillNode.y - 83,
      anchorX: initialDrillNode.anchorX + 41,
      anchorY: initialDrillNode.anchorY - 29,
    };

    Object.assign(initialDrillNode, latestPosition);
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
    const [replacementSimulation] = mocks.runNetworkSimulation.mock.calls[1] as unknown as [
      PhysicsSimulation,
    ];
    const replacementDrillNode = replacementSimulation.nodes.find(
      (node) => node.id === `drill:${drillId}`,
    );

    expect(replacementDrillNode).toMatchObject(latestPosition);
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

function emitZoom(transform: ZoomTransform): void {
  const listener = mocks.zoomListener;
  if (!listener) throw new Error("D3 zoom listener was not registered.");

  act(() => {
    listener({ transform } as D3ZoomEvent<SVGSVGElement, unknown>);
  });
}

function expectedSemanticCompensation(cameraScale: number): number {
  const viewport = { width: 390, height: 844 };
  const baselineScale = getInitialZoomTransform(viewport, getLayoutSize(viewport)).k;
  const relativeCameraScale = cameraScale / baselineScale;
  const relativeVisibleScale = Math.min(
    1.15,
    Math.max(0.9, relativeCameraScale ** 0.15),
  );

  return baselineScale * relativeVisibleScale / cameraScale;
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
