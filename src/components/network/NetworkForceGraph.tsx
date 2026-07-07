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
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GraphEdge, GraphNode, GraphResponse } from "@/data";

type NetworkForceGraphProps = {
  graph: GraphResponse;
  badgeByIconKey: Record<string, string>;
  focusedMethodSlug: string | null;
  graphCanHighlight: boolean;
  onMethodSelect: (slug: string | undefined) => void;
  onDrillSelect: (drillId: string) => void;
};

type Size = {
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

type NodeBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type StoredPosition = {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
};

type PhysicsNode = GraphNode & {
  badgeSrc?: string;
  connectedMethodSlugs: string[];
  primaryMethodSlug?: string;
  displayLabel: string;
  displayLines?: string[];
  vx: number;
  vy: number;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  r: number;
  box: NodeBox;
  dragging?: boolean;
};

type PhysicsLink = GraphEdge & {
  sourceId: string;
  targetId: string;
  source: PhysicsNode;
  target: PhysicsNode;
};

type PhysicsSimulation = {
  alpha: number;
  frame: number | null;
  width: number;
  height: number;
  nodes: PhysicsNode[];
  links: PhysicsLink[];
  dragging: PhysicsNode | null;
};

type DragState = {
  node: PhysicsNode;
  moved: boolean;
  start: Point;
  dragOffset: Point;
  tapMoveThreshold: number;
  pointerId: number;
};

const methodOrder = ["pad-work", "bag-work", "partner-drill", "clinch", "technical-work"];
const fallbackSize: Size = { width: 390, height: 980 };
const zoomBounds = { min: 0.55, max: 2.4 };
const farZoomThreshold = 0.62;

export function NetworkForceGraph({
  graph,
  badgeByIconKey,
  focusedMethodSlug,
  graphCanHighlight,
  onMethodSelect,
  onDrillSelect,
}: NetworkForceGraphProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cameraRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const positionsRef = useRef<Map<string, StoredPosition>>(new Map());
  const simulationRef = useRef<PhysicsSimulation | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [viewportSize, setViewportSize] = useState<Size | null>(null);
  const [cameraTransform, setCameraTransform] = useState<ZoomTransform>(() => zoomIdentity);
  const [zoomLevel, setZoomLevel] = useState<"near" | "far">("near");
  const [physicsNodes, setPhysicsNodes] = useState<PhysicsNode[]>([]);
  const [physicsLinks, setPhysicsLinks] = useState<PhysicsLink[]>([]);

  const renderSize = viewportSize ?? fallbackSize;
  const layoutSize = useMemo(() => getLayoutSize(renderSize), [renderSize]);
  const graphModel = useMemo(
    () => buildGraphModel(graph, badgeByIconKey, positionsRef.current, layoutSize),
    [badgeByIconKey, graph, layoutSize],
  );
  const drillNodes = useMemo(() => physicsNodes.filter((node) => node.type === "drill"), [physicsNodes]);
  const methodNodes = useMemo(
    () => physicsNodes.filter((node) => node.type === "trainingMethod"),
    [physicsNodes],
  );

  const applyZoomTransform = useCallback((transform: ZoomTransform) => {
    setCameraTransform(transform);
    setZoomLevel(transform.k < farZoomThreshold ? "far" : "near");
  }, []);

  const commitSimulationFrame = useCallback((simulation: PhysicsSimulation) => {
    for (const node of simulation.nodes) {
      positionsRef.current.set(node.id, {
        x: node.x,
        y: node.y,
        anchorX: node.anchorX,
        anchorY: node.anchorY,
      });
    }

    setPhysicsNodes([...simulation.nodes]);
    setPhysicsLinks([...simulation.links]);
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateSize = () => {
      const rect = frame.getBoundingClientRect();
      setViewportSize({
        width: Math.max(Math.round(rect.width), 1),
        height: Math.max(Math.round(rect.height), 1),
      });
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(frame);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!viewportSize) return;

    if (simulationRef.current?.frame) {
      cancelAnimationFrame(simulationRef.current.frame);
    }

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
    runNetworkSimulation(simulation, commitSimulationFrame);

    return () => {
      if (simulation.frame) {
        cancelAnimationFrame(simulation.frame);
      }
    };
  }, [commitSimulationFrame, graphModel, layoutSize, viewportSize]);

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
    selection.call(zoomBehavior.transform, getInitialZoomTransform(viewportSize, layoutSize));

    return () => {
      selection.on(".zoom", null);
    };
  }, [applyZoomTransform, layoutSize, viewportSize]);

  function resetCamera() {
    const svg = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svg || !zoomBehavior || !viewportSize) return;

    select(svg).call(zoomBehavior.transform, getInitialZoomTransform(viewportSize, layoutSize));
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
      if (node.type === "trainingMethod") {
        onMethodSelect(node.slug);
      }
      if (node.type === "drill") {
        onDrillSelect(node.entityId);
      }
    }

    dragStateRef.current = null;
  }

  return (
    <div ref={frameRef} className="network-force-frame">
      <svg
        ref={svgRef}
        className="network-force-svg"
        data-zoom-level={zoomLevel}
        viewBox={`0 0 ${renderSize.width} ${renderSize.height}`}
        aria-label="Muay Thai drill network graph"
      >
        <g ref={cameraRef} className="network-force-camera" transform={cameraTransform.toString()}>
          <g className="network-force-edges">
            {physicsLinks.map((link) => {
              const active = !graphCanHighlight || link.active;

              return (
                <line
                  key={link.id}
                  className="network-force-edge"
                  x1={link.source.x}
                  y1={link.source.y}
                  x2={link.target.x}
                  y2={link.target.y}
                  data-active={active}
                  data-focus-active={Boolean(graphCanHighlight && link.active)}
                />
              );
            })}
          </g>

          <g className="network-force-nodes">
            {drillNodes.map((node) => (
              <g
                key={node.id}
                className="network-force-node network-force-drill-node"
                data-node-id={node.id}
                data-active={!graphCanHighlight || node.active}
                data-highlighted={Boolean(graphCanHighlight && node.active)}
                data-far-visible={Boolean(graphCanHighlight && node.active)}
                transform={`translate(${node.x}, ${node.y})`}
                onPointerDown={(event) => handleNodePointerDown(node, event)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={finishNodeDrag}
                onPointerCancel={finishNodeDrag}
              >
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
            ))}

            {methodNodes.map((node) => (
              <g
                key={node.id}
                className="network-force-node network-force-method-node"
                data-node-id={node.id}
                data-active={!graphCanHighlight || node.active}
                data-focused={node.slug === focusedMethodSlug}
                transform={`translate(${node.x}, ${node.y})`}
                onPointerDown={(event) => handleNodePointerDown(node, event)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={finishNodeDrag}
                onPointerCancel={finishNodeDrag}
              >
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
                  <path className="network-force-method-fallback" d="M0,-33 L29,-16 L29,16 L0,33 L-29,16 L-29,-16 Z" />
                )}
                <text textAnchor="middle" y="40">
                  {node.label}
                </text>
              </g>
            ))}
          </g>
        </g>
      </svg>
      <button type="button" className="network-recenter-button" onClick={resetCamera}>
        Reset
      </button>
    </div>
  );
}

function buildGraphModel(
  graph: GraphResponse,
  badgeByIconKey: Record<string, string>,
  previousPositions: Map<string, StoredPosition>,
  layoutSize: Size,
): { nodes: PhysicsNode[]; links: PhysicsLink[] } {
  const center = getCenter(layoutSize);
  const methodNodes = graph.nodes
    .filter((node) => node.type === "trainingMethod")
    .sort((a, b) => getMethodRank(a.slug) - getMethodRank(b.slug));
  const methodNodeIds = new Set(methodNodes.map((node) => node.id));
  const methodsById = new Map<string, GraphNode>(methodNodes.map((node) => [node.id, node]));
  const methodSlugsByDrillId = collectMethodSlugsByDrillId(graph.edges, methodsById, methodNodeIds);
  const nodes: PhysicsNode[] = [];

  for (const [index, graphNode] of methodNodes.entries()) {
    const anchor = getMethodAnchorPoint(graphNode.slug, index, methodNodes.length, layoutSize);
    const previous = previousPositions.get(graphNode.id);
    const node = createPhysicsNode(graphNode, {
      x: previous?.x ?? anchor.x,
      y: previous?.y ?? anchor.y,
      anchorX: previous?.anchorX ?? anchor.x,
      anchorY: previous?.anchorY ?? anchor.y,
      r: 31,
      badgeSrc: graphNode.iconKey ? badgeByIconKey[graphNode.iconKey] : undefined,
      connectedMethodSlugs: graphNode.slug ? [graphNode.slug] : [],
      primaryMethodSlug: graphNode.slug,
      displayLabel: graphNode.label,
    });

    nodes.push(node);
  }

  const methodPhysicsBySlug = new Map(
    nodes
      .filter((node) => node.type === "trainingMethod" && node.slug)
      .map((node) => [node.slug as string, node]),
  );
  const drillNodes = graph.nodes.filter((node) => node.type === "drill");

  for (const [index, graphNode] of drillNodes.entries()) {
    const connectedMethodSlugs = methodSlugsByDrillId.get(graphNode.id) ?? [];
    const primaryMethodSlug = pickPrimaryMethodSlug(connectedMethodSlugs);
    const methodNode = primaryMethodSlug ? methodPhysicsBySlug.get(primaryMethodSlug) : undefined;
    const angle = methodNode
      ? Math.atan2(methodNode.anchorY - center.y, methodNode.anchorX - center.x) + ((index % 5) - 2) * 0.16
      : -Math.PI / 2 + (index / Math.max(drillNodes.length, 1)) * Math.PI * 2;
    const depth = 92 + (index % 4) * 28;
    const fallbackX = methodNode ? methodNode.x + Math.cos(angle) * depth : center.x + Math.cos(angle) * layoutSize.width * 0.24;
    const fallbackY = methodNode ? methodNode.y + Math.sin(angle) * depth : center.y + Math.sin(angle) * layoutSize.height * 0.24;
    const previous = previousPositions.get(graphNode.id);
    const node = createPhysicsNode(graphNode, {
      x: previous?.x ?? fallbackX,
      y: previous?.y ?? fallbackY,
      anchorX: previous?.anchorX ?? fallbackX,
      anchorY: previous?.anchorY ?? fallbackY,
      r: 7.5,
      connectedMethodSlugs,
      primaryMethodSlug,
      displayLabel: truncateLabel(graphNode.label, 24),
    });

    nodes.push(node);
  }

  for (const [index, graphNode] of graph.nodes.filter((node) => node.type !== "trainingMethod" && node.type !== "drill").entries()) {
    const angle = -Math.PI / 2 + (index / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
    const previous = previousPositions.get(graphNode.id);
    const x = center.x + Math.cos(angle) * layoutSize.width * 0.22;
    const y = center.y + Math.sin(angle) * layoutSize.height * 0.22;

    nodes.push(
      createPhysicsNode(graphNode, {
        x: previous?.x ?? x,
        y: previous?.y ?? y,
        anchorX: previous?.anchorX ?? x,
        anchorY: previous?.anchorY ?? y,
        r: 6,
        connectedMethodSlugs: [],
        displayLabel: truncateLabel(graphNode.label, 22),
      }),
    );
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const links: PhysicsLink[] = [];

  for (const edge of graph.edges) {
    const source = nodesById.get(edge.from);
    const target = nodesById.get(edge.to);
    if (!source || !target) continue;

    links.push({
      ...edge,
      sourceId: edge.from,
      targetId: edge.to,
      source,
      target,
    });
  }

  for (const node of nodes) {
    node.box = measureNodeBox(node);
  }

  return { nodes, links };
}

function createPhysicsNode(
  graphNode: GraphNode,
  options: {
    x: number;
    y: number;
    anchorX: number;
    anchorY: number;
    r: number;
    badgeSrc?: string;
    connectedMethodSlugs: string[];
    primaryMethodSlug?: string;
    displayLabel: string;
  },
): PhysicsNode {
  const node: PhysicsNode = {
    ...graphNode,
    badgeSrc: options.badgeSrc,
    connectedMethodSlugs: options.connectedMethodSlugs,
    primaryMethodSlug: options.primaryMethodSlug,
    displayLabel: options.displayLabel,
    displayLines: [options.displayLabel],
    vx: 0,
    vy: 0,
    x: options.x,
    y: options.y,
    anchorX: options.anchorX,
    anchorY: options.anchorY,
    r: options.r,
    box: { left: 0, right: 0, top: 0, bottom: 0 },
  };

  node.box = measureNodeBox(node);
  return node;
}

function runNetworkSimulation(simulation: PhysicsSimulation, commitFrame: (simulation: PhysicsSimulation) => void) {
  if (simulation.frame) return;

  const step = () => {
    tickNetwork(simulation);
    commitFrame(simulation);
    simulation.alpha *= 0.982;

    if (simulation.alpha > 0.012 || simulation.dragging) {
      simulation.frame = requestAnimationFrame(step);
    } else {
      simulation.frame = null;
    }
  };

  simulation.frame = requestAnimationFrame(step);
}

function tickNetwork(simulation: PhysicsSimulation) {
  const { nodes, links, width, height } = simulation;
  const alpha = simulation.alpha;
  const center = getCenter({ width, height });

  for (const link of links) {
    const from = link.source;
    const to = link.target;
    const dx = to.x - from.x || 0.01;
    const dy = to.y - from.y || 0.01;
    const distance = Math.hypot(dx, dy);
    const hasAnchor = from.type === "trainingMethod" || to.type === "trainingMethod";
    const desired = hasAnchor ? 148 : 108;
    const strength = hasAnchor ? 0.012 : 0.015;
    const force = ((distance - desired) / distance) * strength * alpha;
    const fx = dx * force;
    const fy = dy * force;

    if (!from.dragging) {
      from.vx += fx;
      from.vy += fy;
    }
    if (!to.dragging) {
      to.vx -= fx;
      to.vy -= fy;
    }
  }

  for (const node of nodes) {
    if (node.type === "trainingMethod" && !node.dragging) {
      node.vx += (node.anchorX - node.x) * 0.007 * alpha;
      node.vy += (node.anchorY - node.y) * 0.007 * alpha;
    } else if (!node.dragging) {
      node.vx += (center.x - node.x) * 0.0007 * alpha;
      node.vy += (center.y - node.y) * 0.0007 * alpha;
    }
  }

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x || 0.01;
      const dy = b.y - a.y || 0.01;
      const distanceSquared = dx * dx + dy * dy;
      const needsSpace = a.type === "trainingMethod" || b.type === "trainingMethod";
      const strength = (needsSpace ? 1320 : 720) * alpha;
      const force = Math.min(strength / distanceSquared, 0.24);
      const distance = Math.sqrt(distanceSquared);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      if (!a.dragging) {
        a.vx -= fx;
        a.vy -= fy;
      }
      if (!b.dragging) {
        b.vx += fx;
        b.vy += fy;
      }
    }
  }

  for (const node of nodes) {
    if (!node.dragging) {
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= 0.9;
      node.vy *= 0.9;
    }
    keepNodeInBounds(node, width, height);
  }

  for (let pass = 0; pass < 2; pass += 1) {
    resolveLabelCollisions(nodes, Math.min(alpha + 0.08, 0.72));
  }

  for (const node of nodes) {
    keepNodeInBounds(node, width, height);
  }
}

function resolveLabelCollisions(nodes: PhysicsNode[], alpha: number) {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const aLeft = a.x + a.box.left;
      const aRight = a.x + a.box.right;
      const aTop = a.y + a.box.top;
      const aBottom = a.y + a.box.bottom;
      const bLeft = b.x + b.box.left;
      const bRight = b.x + b.box.right;
      const bTop = b.y + b.box.top;
      const bBottom = b.y + b.box.bottom;
      const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
      const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);

      if (overlapX <= 0 || overlapY <= 0) continue;

      const xDirection = a.x < b.x ? -1 : 1;
      const yDirection = a.y < b.y ? -1 : 1;
      const push = Math.min(4, (Math.min(overlapX, overlapY) / 2 + 2) * alpha * 0.58);

      if (overlapX < overlapY) {
        if (!a.dragging) a.x += xDirection * push;
        if (!b.dragging) b.x -= xDirection * push;
      } else {
        if (!a.dragging) a.y += yDirection * push;
        if (!b.dragging) b.y -= yDirection * push;
      }
    }
  }
}

function keepNodeInBounds(node: PhysicsNode, width: number, height: number) {
  const margin = 10;
  const left = margin - node.box.left;
  const right = width - margin - node.box.right;
  const top = margin - node.box.top;
  const bottom = height - margin - node.box.bottom;

  node.x = clamp(node.x, left, right);
  node.y = clamp(node.y, top, bottom);
}

function measureNodeBox(node: PhysicsNode): NodeBox {
  const labelWidth = estimatedTextWidth(node.displayLabel, node.type);
  const isAnchor = node.type === "trainingMethod";
  const labelHeight = isAnchor ? 18 : 14;
  const padding = isAnchor ? 9 : 7;

  if (isAnchor) {
    const halfWidth = Math.max(node.r + padding, labelWidth / 2 + padding);

    return {
      left: -halfWidth,
      right: halfWidth,
      top: -node.r - padding - 6,
      bottom: node.r + labelHeight + padding + 7,
    };
  }

  return {
    left: -node.r - padding,
    right: node.r + 7 + labelWidth + padding,
    top: -Math.max(node.r + padding, labelHeight / 2 + padding),
    bottom: Math.max(node.r + padding, labelHeight / 2 + padding),
  };
}

function estimatedTextWidth(label: string, type: GraphNode["type"]): number {
  const charWidth = type === "trainingMethod" ? 7.5 : 6.4;
  return label.length * charWidth;
}

function pointerToGraphPoint(event: ReactPointerEvent<SVGGElement>, camera: SVGGElement): Point {
  const svg = camera.ownerSVGElement;
  const matrix = camera.getScreenCTM();
  if (!svg || !matrix) return { x: 0, y: 0 };

  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(matrix.inverse());

  return { x: transformed.x, y: transformed.y };
}

function getLayoutSize(viewport: Size): Size {
  return {
    width: Math.max(Math.round(viewport.width * 1.26), 500),
    height: Math.max(Math.round(viewport.height * 1.35), 980),
  };
}

function getInitialZoomTransform(viewport: Size, layout: Size): ZoomTransform {
  const scale = clamp(Math.min(viewport.width / layout.width, viewport.height / layout.height) * 1.04, 0.62, 1);

  return zoomIdentity
    .translate((viewport.width - layout.width * scale) / 2, (viewport.height - layout.height * scale) / 2)
    .scale(scale);
}

function getMethodAnchorPoint(slug: string | undefined, fallbackIndex: number, methodCount: number, layoutSize: Size): Point {
  const center = getCenter(layoutSize);
  const radiusX = Math.min(layoutSize.width * 0.34, 210);
  const radiusY = Math.min(layoutSize.height * 0.35, 300);
  const rank = getMethodRank(slug);
  const index = rank === Number.MAX_SAFE_INTEGER ? fallbackIndex : rank;
  const count = Math.max(methodCount, methodOrder.length, 1);
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;

  return {
    x: center.x + Math.cos(angle) * radiusX,
    y: center.y + Math.sin(angle) * radiusY,
  };
}

function getCenter(size: Size): Point {
  return {
    x: size.width / 2,
    y: size.height / 2,
  };
}

function collectMethodSlugsByDrillId(
  edges: GraphEdge[],
  methodsById: Map<string, GraphNode>,
  methodNodeIds: Set<string>,
): Map<string, string[]> {
  const methodSlugsByDrillId = new Map<string, string[]>();

  for (const edge of edges) {
    if (edge.type !== "method") continue;

    const methodId = methodNodeIds.has(edge.from) ? edge.from : methodNodeIds.has(edge.to) ? edge.to : undefined;
    const drillId = methodId === edge.from ? edge.to : edge.from;
    const methodSlug = methodId ? methodsById.get(methodId)?.slug : undefined;
    if (!methodSlug) continue;

    const currentSlugs = methodSlugsByDrillId.get(drillId) ?? [];
    if (!currentSlugs.includes(methodSlug)) {
      currentSlugs.push(methodSlug);
      currentSlugs.sort((a, b) => getMethodRank(a) - getMethodRank(b));
    }
    methodSlugsByDrillId.set(drillId, currentSlugs);
  }

  return methodSlugsByDrillId;
}

function pickPrimaryMethodSlug(methodSlugs: string[]): string | undefined {
  return [...methodSlugs].sort((a, b) => getMethodRank(a) - getMethodRank(b))[0];
}

function getMethodRank(slug: string | undefined): number {
  if (!slug) return Number.MAX_SAFE_INTEGER;
  const rank = methodOrder.indexOf(slug);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

function truncateLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(maxLength - 3, 1))}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
