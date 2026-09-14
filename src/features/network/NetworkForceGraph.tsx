"use client";

import {
  select,
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GraphResponse } from "@/data";
import type { NetworkGraphVisualState } from "./types";
import {
  buildGraphModel,
  getInitialZoomTransform,
  getLayoutSize,
  pointerToGraphPoint,
  runNetworkSimulation,
  type PhysicsLink,
  type PhysicsNode,
  type PhysicsSimulation,
  type Point,
  type Size,
  type StoredPosition,
} from "./network-physics";
import {
  getVisibleViewportSize,
  pauseNetworkSimulation,
  resumeNetworkSimulation,
} from "./network-lifecycle";
import styles from "./NetworkForceGraph.module.css";

type NetworkForceGraphProps = {
  active: boolean;
  graph: GraphResponse;
  badgeByIconKey: Record<string, string>;
  focusedMethodSlugs: string[];
  visualState: NetworkGraphVisualState;
  onMethodSelect: (slug: string | undefined) => void;
  onDrillSelect: (drillId: string) => void;
};

type DragState = {
  node: PhysicsNode;
  moved: boolean;
  start: Point;
  dragOffset: Point;
  tapMoveThreshold: number;
  pointerId: number;
};

const fallbackSize: Size = { width: 390, height: 980 };
const zoomBounds = { min: 0.55, max: 2.4 };
const farZoomThreshold = 0.62;
const semanticZoomExponent = 0.15;
const semanticNodeScaleBounds = { min: 0.9, max: 1.15 };

export function NetworkForceGraph({
  active,
  graph,
  badgeByIconKey,
  focusedMethodSlugs,
  visualState,
  onMethodSelect,
  onDrillSelect,
}: NetworkForceGraphProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cameraRef = useRef<SVGGElement | null>(null);
  const nodeElementsRef = useRef<Map<string, SVGGElement>>(new Map());
  const linkElementsRef = useRef<Map<string, SVGLineElement>>(new Map());
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const positionsRef = useRef<Map<string, StoredPosition>>(new Map());
  const simulationRef = useRef<PhysicsSimulation | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const activeRef = useRef(active);
  const cameraTransformRef = useRef<ZoomTransform>(zoomIdentity);
  const cameraScaleRef = useRef<number | null>(null);
  const cameraBaselineScaleRef = useRef<number | null>(null);
  const semanticNodeCompensationRef = useRef(1);
  const zoomLevelRef = useRef<"near" | "far">("near");
  const [viewportSize, setViewportSize] = useState<Size | null>(null);
  const [zoomLevel, setZoomLevel] = useState<"near" | "far">("near");
  const [physicsNodes, setPhysicsNodes] = useState<PhysicsNode[]>([]);
  const [physicsLinks, setPhysicsLinks] = useState<PhysicsLink[]>([]);

  const renderSize = viewportSize ?? fallbackSize;
  const layoutSize = useMemo(() => getLayoutSize(renderSize), [renderSize]);
  const initialCameraTransform = useMemo(
    () => getInitialZoomTransform(renderSize, layoutSize),
    [layoutSize, renderSize],
  );
  const drillNodes = useMemo(() => physicsNodes.filter((node) => node.type === "drill"), [physicsNodes]);
  const methodNodes = useMemo(
    () => physicsNodes.filter((node) => node.type === "trainingMethod"),
    [physicsNodes],
  );
  const layerNodes = useMemo(
    () => physicsNodes.filter((node) => node.type === "tag" || node.type === "customTag" || node.type === "statusTag"),
    [physicsNodes],
  );
  const focusedMethodSet = useMemo(() => new Set(focusedMethodSlugs), [focusedMethodSlugs]);

  const captureCameraElement = useCallback((element: SVGGElement | null) => {
    cameraRef.current = element;
    element?.setAttribute("transform", cameraTransformRef.current.toString());
  }, []);

  const captureNodeElement = useCallback((element: SVGGElement | null) => {
    if (!element) return;

    const nodeId = element.dataset.nodeId;
    if (!nodeId) return;
    nodeElementsRef.current.set(nodeId, element);
    setNodeVisualCompensation(element, semanticNodeCompensationRef.current);

    return () => {
      if (nodeElementsRef.current.get(nodeId) === element) {
        nodeElementsRef.current.delete(nodeId);
      }
    };
  }, []);

  const captureLinkElement = useCallback((element: SVGLineElement | null) => {
    if (!element) return;

    const linkId = element.dataset.linkId;
    if (!linkId) return;
    linkElementsRef.current.set(linkId, element);

    return () => {
      if (linkElementsRef.current.get(linkId) === element) {
        linkElementsRef.current.delete(linkId);
      }
    };
  }, []);

  const applyZoomTransform = useCallback((transform: ZoomTransform) => {
    cameraTransformRef.current = transform;
    cameraRef.current?.setAttribute("transform", transform.toString());

    if (
      cameraScaleRef.current !== transform.k
      || cameraBaselineScaleRef.current !== initialCameraTransform.k
    ) {
      cameraScaleRef.current = transform.k;
      cameraBaselineScaleRef.current = initialCameraTransform.k;
      const compensation = getSemanticNodeScale(
        transform.k,
        initialCameraTransform.k,
      ).compensation;
      semanticNodeCompensationRef.current = compensation;

      for (const element of nodeElementsRef.current.values()) {
        setNodeVisualCompensation(element, compensation);
      }
    }

    const nextZoomLevel = transform.k < farZoomThreshold ? "far" : "near";
    if (zoomLevelRef.current !== nextZoomLevel) {
      zoomLevelRef.current = nextZoomLevel;
      setZoomLevel(nextZoomLevel);
    }
  }, [initialCameraTransform.k]);

  const commitSimulationFrame = useCallback((simulation: PhysicsSimulation) => {
    if (simulationRef.current !== simulation) return;

    for (const node of simulation.nodes) {
      nodeElementsRef.current
        .get(node.id)
        ?.setAttribute("transform", `translate(${node.x}, ${node.y})`);
    }

    for (const link of simulation.links) {
      const element = linkElementsRef.current.get(link.id);
      if (!element) continue;

      element.setAttribute("x1", String(link.source.x));
      element.setAttribute("y1", String(link.source.y));
      element.setAttribute("x2", String(link.target.x));
      element.setAttribute("y2", String(link.target.y));
    }
  }, []);

  const commitSimulationTopology = useCallback((simulation: PhysicsSimulation) => {
    setPhysicsNodes([...simulation.nodes]);
    setPhysicsLinks([...simulation.links]);
  }, []);

  const measureViewport = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const nextSize = getVisibleViewportSize(rect.width, rect.height);
    if (!nextSize) return;
    setViewportSize((current) => (
      current?.width === nextSize.width && current.height === nextSize.height
        ? current
        : nextSize
    ));
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    measureViewport();
    const resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(frame);

    return () => resizeObserver.disconnect();
  }, [measureViewport]);

  useEffect(() => {
    activeRef.current = active;
    const simulation = simulationRef.current;

    if (!active) {
      pauseNetworkSimulation(simulation, cancelAnimationFrame);
      dragStateRef.current = null;
      return;
    }

    measureViewport();
    resumeNetworkSimulation(active, simulation, (current) => {
      runNetworkSimulation(current, commitSimulationFrame);
    });
  }, [active, commitSimulationFrame, measureViewport]);

  useEffect(() => {
    if (!viewportSize) return;

    if (simulationRef.current?.frame) {
      cancelAnimationFrame(simulationRef.current.frame);
    }

    const storedPositions = positionsRef.current;
    const graphModel = buildGraphModel(graph, badgeByIconKey, storedPositions, layoutSize);
    const simulation: PhysicsSimulation = {
      alpha: 1,
      frame: null,
      width: layoutSize.width,
      height: layoutSize.height,
      nodes: graphModel.nodes,
      links: graphModel.links,
      dragging: null,
    };

    simulationRef.current = simulation;
    commitSimulationFrame(simulation);
    commitSimulationTopology(simulation);
    if (activeRef.current) runNetworkSimulation(simulation, commitSimulationFrame);

    return () => {
      if (simulation.frame) {
        cancelAnimationFrame(simulation.frame);
      }
      snapshotSimulationPositions(simulation, storedPositions);
      if (simulationRef.current === simulation) {
        simulationRef.current = null;
      }
    };
  }, [badgeByIconKey, commitSimulationFrame, commitSimulationTopology, graph, layoutSize, viewportSize]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !viewportSize) return;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([zoomBounds.min, zoomBounds.max])
      .extent([
        [0, 0],
        [viewportSize.width, viewportSize.height],
      ])
      .translateExtent([
        [-160, -160],
        [layoutSize.width + 160, layoutSize.height + 160],
      ])
      .filter((event) => {
        const target = event.target as Element | null;
        const isNodeGesture = Boolean(target?.closest(".network-force-node"));
        const isWheel = event.type === "wheel";
        const isTouchViewportGesture = event.type.startsWith("touch") && !isNodeGesture;
        const isPointerPan =
          event.type === "mousedown" && "button" in event && event.button === 0 && !isNodeGesture;

        return isWheel || isTouchViewportGesture || isPointerPan;
      })
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        applyZoomTransform(event.transform);
      });

    const selection = select(svg);
    zoomBehaviorRef.current = zoomBehavior;
    selection.call(zoomBehavior).on("dblclick.zoom", null);
    selection.call(zoomBehavior.transform, initialCameraTransform);

    return () => {
      selection.on(".zoom", null);
    };
  }, [applyZoomTransform, initialCameraTransform, layoutSize, viewportSize]);

  function resetCamera() {
    const svg = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svg || !zoomBehavior || !viewportSize) return;

    select(svg).call(zoomBehavior.transform, initialCameraTransform);
  }

  function handleNodePointerDown(node: PhysicsNode, event: ReactPointerEvent<SVGGElement>) {
    const camera = cameraRef.current;
    const simulation = simulationRef.current;
    if (!camera || !simulation) return;

    event.preventDefault();
    event.stopPropagation();

    const start = pointerToGraphPoint(event, camera);
    dragStateRef.current = {
      node,
      moved: false,
      start,
      dragOffset: {
        x: node.x - start.x,
        y: node.y - start.y,
      },
      tapMoveThreshold: event.pointerType === "touch" ? 12 : 6,
      pointerId: event.pointerId,
    };

    node.dragging = true;
    node.vx = 0;
    node.vy = 0;
    simulation.dragging = node;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleNodePointerMove(event: ReactPointerEvent<SVGGElement>) {
    const dragState = dragStateRef.current;
    const camera = cameraRef.current;
    const simulation = simulationRef.current;
    if (!dragState || !camera || !simulation || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const point = pointerToGraphPoint(event, camera);
    const dx = point.x - dragState.start.x;
    const dy = point.y - dragState.start.y;
    if (Math.hypot(dx, dy) > dragState.tapMoveThreshold) {
      dragState.moved = true;
    }

    if (!dragState.moved) return;

    const node = dragState.node;
    node.x = point.x + dragState.dragOffset.x;
    node.y = point.y + dragState.dragOffset.y;
    node.vx = 0;
    node.vy = 0;

    if (node.type === "trainingMethod") {
      node.anchorX = node.x;
      node.anchorY = node.y;
    }

    simulation.alpha = Math.max(simulation.alpha, 0.62);
    runNetworkSimulation(simulation, commitSimulationFrame);
  }

  function finishNodeDrag(event: ReactPointerEvent<SVGGElement>) {
    const dragState = dragStateRef.current;
    const simulation = simulationRef.current;
    if (!dragState || !simulation || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const node = dragState.node;
    node.dragging = false;
    simulation.dragging = null;
    simulation.alpha = Math.max(simulation.alpha, 0.42);
    runNetworkSimulation(simulation, commitSimulationFrame);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!dragState.moved) {
      activateNode(node);
    }

    dragStateRef.current = null;
  }

  function activateNode(node: PhysicsNode) {
    if (node.type === "trainingMethod") {
      onMethodSelect(node.slug);
    }
    if (node.type === "drill") {
      onDrillSelect(node.entityId);
    }
  }

  function handleNodeKeyDown(node: PhysicsNode, event: ReactKeyboardEvent<SVGGElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    event.stopPropagation();
    activateNode(node);
  }

  function handleNodeClick(node: PhysicsNode, event: ReactMouseEvent<SVGGElement>) {
    // Pointer taps activate on pointerup so dragging remains possible. A zero-detail
    // click is synthetic (for example, from assistive technology) and still needs
    // an activation path because SVG groups have no native button behavior.
    if (event.detail !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    activateNode(node);
  }

  return (
    <div ref={frameRef} className={styles.root}>
      <svg
        ref={svgRef}
        className="network-force-svg"
        data-zoom-level={zoomLevel}
        viewBox={`0 0 ${renderSize.width} ${renderSize.height}`}
        aria-label="Muay Thai drill network graph"
      >
        <g ref={captureCameraElement} className="network-force-camera">
          <g className="network-force-edges">
            {physicsLinks.map((link) => {
              const active = visualState.activeEdgeIds.has(link.id);
              const highlighted = Boolean(visualState.canHighlight && active);
              const muted = Boolean(visualState.canHighlight && !active);

              return (
                <line
                  ref={captureLinkElement}
                  key={link.id}
                  className="network-force-edge"
                  data-link-id={link.id}
                  x1={link.source.x}
                  y1={link.source.y}
                  x2={link.target.x}
                  y2={link.target.y}
                  data-active={highlighted}
                  data-muted={muted}
                  data-focus-active={highlighted}
                />
              );
            })}
          </g>

          <g className="network-force-nodes">
            {drillNodes.map((node) => {
              const active = visualState.activeNodeIds.has(node.id);

              return (
                <g
                  ref={captureNodeElement}
                  key={node.id}
                  className="network-force-node network-force-drill-node"
                  data-node-id={node.id}
                  data-active={!visualState.canHighlight || active}
                  data-highlighted={Boolean(visualState.canHighlight && active)}
                  data-far-visible={Boolean(visualState.canHighlight && active)}
                  transform={`translate(${node.x}, ${node.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open drill ${node.label}`}
                  onPointerDown={(event) => handleNodePointerDown(node, event)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={finishNodeDrag}
                  onPointerCancel={finishNodeDrag}
                  onKeyDown={(event) => handleNodeKeyDown(node, event)}
                  onClick={(event) => handleNodeClick(node, event)}
                >
                  <g className="network-force-node-visual">
                    <rect
                      className="network-force-hit-area"
                      x="-18"
                      y="-18"
                      width="36"
                      height="36"
                      rx="18"
                    />
                    <circle r="7.5" />
                    <text className="network-force-drill-label" x={node.r + 7} y="4">
                      {node.displayLabel}
                    </text>
                  </g>
                </g>
              );
            })}

            {methodNodes.map((node) => {
              const active = visualState.activeNodeIds.has(node.id);

              return (
                <g
                  ref={captureNodeElement}
                  key={node.id}
                  className="network-force-node network-force-method-node"
                  data-node-id={node.id}
                  data-active={!visualState.canHighlight || active}
                  data-focused={Boolean(node.slug && focusedMethodSet.has(node.slug))}
                  transform={`translate(${node.x}, ${node.y})`}
                  role={node.slug ? "button" : undefined}
                  tabIndex={node.slug ? 0 : undefined}
                  aria-label={node.slug ? `Filter by training method ${node.label}` : undefined}
                  aria-pressed={node.slug ? focusedMethodSet.has(node.slug) : undefined}
                  onPointerDown={(event) => handleNodePointerDown(node, event)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={finishNodeDrag}
                  onPointerCancel={finishNodeDrag}
                  onKeyDown={(event) => handleNodeKeyDown(node, event)}
                  onClick={node.slug ? (event) => handleNodeClick(node, event) : undefined}
                >
                  <g className="network-force-node-visual">
                    <rect
                      className="network-force-hit-area"
                      x={node.box.left - 8}
                      y={node.box.top - 8}
                      width={node.box.right - node.box.left + 16}
                      height={node.box.bottom - node.box.top + 16}
                      rx="12"
                    />
                    {node.badgeSrc ? (
                      <image
                        href={node.badgeSrc}
                        x="-31"
                        y="-37"
                        width="62"
                        height="62"
                        preserveAspectRatio="xMidYMid meet"
                      />
                    ) : (
                      <path
                        className="network-force-method-fallback"
                        d="M0,-33 L29,-16 L29,16 L0,33 L-29,16 L-29,-16 Z"
                      />
                    )}
                    <text textAnchor="middle" y="40">
                      {node.label}
                    </text>
                  </g>
                </g>
              );
            })}

            {layerNodes.map((node) => {
              const active = visualState.activeNodeIds.has(node.id);

              return (
                <g
                  ref={captureNodeElement}
                  key={node.id}
                  className="network-force-node network-force-label-node"
                  data-node-id={node.id}
                  data-node-type={node.type}
                  data-active={!visualState.canHighlight || active}
                  data-highlighted={Boolean(visualState.canHighlight && active)}
                  data-far-visible={Boolean(visualState.canHighlight && active)}
                  transform={`translate(${node.x}, ${node.y})`}
                  onPointerDown={(event) => handleNodePointerDown(node, event)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={finishNodeDrag}
                  onPointerCancel={finishNodeDrag}
                >
                  <g className="network-force-node-visual">
                    <rect
                      className="network-force-hit-area"
                      x={node.box.left - 5}
                      y={node.box.top - 5}
                      width={node.box.right - node.box.left + 10}
                      height={node.box.bottom - node.box.top + 10}
                      rx="8"
                    />
                    <circle r={node.r} />
                    <text x={node.r + 7} y="4">
                      {node.displayLabel}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <button type="button" className="network-recenter-button" onClick={resetCamera}>
        Reset
      </button>
    </div>
  );
}

function snapshotSimulationPositions(
  simulation: PhysicsSimulation,
  positions: Map<string, StoredPosition>,
): void {
  for (const node of simulation.nodes) {
    positions.set(node.id, {
      x: node.x,
      y: node.y,
      anchorX: node.anchorX,
      anchorY: node.anchorY,
    });
  }
}

function setNodeVisualCompensation(element: SVGGElement, compensation: number): void {
  const visual = element.firstElementChild;
  if (!visual?.classList.contains("network-force-node-visual")) return;

  visual.setAttribute("transform", `scale(${compensation})`);
}

function getSemanticNodeScale(cameraScale: number, baselineCameraScale: number): {
  visible: number;
  compensation: number;
} {
  const safeCameraScale = Math.max(cameraScale, Number.EPSILON);
  const safeBaselineScale = Math.max(baselineCameraScale, Number.EPSILON);
  const relativeCameraScale = safeCameraScale / safeBaselineScale;
  const relativeVisibleScale = Math.min(
    semanticNodeScaleBounds.max,
    Math.max(semanticNodeScaleBounds.min, relativeCameraScale ** semanticZoomExponent),
  );
  const visible = safeBaselineScale * relativeVisibleScale;

  return {
    visible,
    compensation: visible / safeCameraScale,
  };
}
