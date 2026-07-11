import { zoomIdentity, type ZoomTransform } from "d3";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { GraphEdge, GraphNode, GraphResponse } from "@/data";

export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

type NodeBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type StoredPosition = {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
};

export type PhysicsNode = GraphNode & {
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

export type PhysicsLink = GraphEdge & {
  sourceId: string;
  targetId: string;
  source: PhysicsNode;
  target: PhysicsNode;
};

export type PhysicsSimulation = {
  alpha: number;
  frame: number | null;
  width: number;
  height: number;
  nodes: PhysicsNode[];
  links: PhysicsLink[];
  dragging: PhysicsNode | null;
};

const methodOrder = ["pad-work", "bag-work", "partner-drill", "clinch", "technical-work"];

// Wireframe-derived custom physics. Keep values stable unless deliberately tuning graph feel.
export function buildGraphModel(
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
  const drillNodesById = new Map(graph.nodes.filter((node) => node.type === "drill").map((node) => [node.id, node]));
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
    const fallbackX = methodNode
      ? methodNode.x + Math.cos(angle) * depth
      : center.x + Math.cos(angle) * layoutSize.width * 0.24;
    const fallbackY = methodNode
      ? methodNode.y + Math.sin(angle) * depth
      : center.y + Math.sin(angle) * layoutSize.height * 0.24;
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

  for (const [index, graphNode] of graph.nodes
    .filter((node) => node.type !== "trainingMethod" && node.type !== "drill")
    .entries()) {
    const connectedDrillIds = collectConnectedDrillIds(graph.edges, graphNode.id, drillNodesById);
    const connectedDrillPositions = connectedDrillIds
      .map((id) => nodes.find((node) => node.id === id))
      .filter((node): node is PhysicsNode => Boolean(node));
    const centroid = getNodeCentroid(connectedDrillPositions) ?? center;
    const angle = -Math.PI / 2 + (index / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
    const previous = previousPositions.get(graphNode.id);
    const x = centroid.x + Math.cos(angle) * 72;
    const y = centroid.y + Math.sin(angle) * 72;

    nodes.push(
      createPhysicsNode(graphNode, {
        x: previous?.x ?? x,
        y: previous?.y ?? y,
        anchorX: previous?.anchorX ?? x,
        anchorY: previous?.anchorY ?? y,
        r: graphNode.type === "statusTag" ? 6.8 : 5.8,
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

export function runNetworkSimulation(
  simulation: PhysicsSimulation,
  commitFrame: (simulation: PhysicsSimulation) => void,
) {
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

export function pointerToGraphPoint(event: ReactPointerEvent<SVGGElement>, camera: SVGGElement): Point {
  const svg = camera.ownerSVGElement;
  const matrix = camera.getScreenCTM();
  if (!svg || !matrix) return { x: 0, y: 0 };

  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(matrix.inverse());

  return { x: transformed.x, y: transformed.y };
}

export function getLayoutSize(viewport: Size): Size {
  return {
    width: Math.max(Math.round(viewport.width * 1.26), 500),
    height: Math.max(Math.round(viewport.height * 1.35), 980),
  };
}

export function getInitialZoomTransform(viewport: Size, layout: Size): ZoomTransform {
  const scale = clamp(Math.min(viewport.width / layout.width, viewport.height / layout.height) * 1.04, 0.62, 1);

  return zoomIdentity
    .translate((viewport.width - layout.width * scale) / 2, (viewport.height - layout.height * scale) / 2)
    .scale(scale);
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
    const hasLayer = isLayerNode(from) || isLayerNode(to);
    const desired = hasAnchor ? 148 : hasLayer ? 76 : 108;
    const strength = hasAnchor ? 0.012 : hasLayer ? 0.01 : 0.015;
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
  const charWidth = type === "trainingMethod" ? 7.5 : isLayerType(type) ? 5.9 : 6.4;
  return label.length * charWidth;
}

function getMethodAnchorPoint(
  slug: string | undefined,
  fallbackIndex: number,
  methodCount: number,
  layoutSize: Size,
): Point {
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

function collectConnectedDrillIds(
  edges: GraphEdge[],
  nodeId: string,
  drillNodesById: Map<string, GraphNode>,
): string[] {
  return edges
    .map((edge) => {
      if (edge.from === nodeId && drillNodesById.has(edge.to)) return edge.to;
      if (edge.to === nodeId && drillNodesById.has(edge.from)) return edge.from;
      return undefined;
    })
    .filter((id): id is string => Boolean(id));
}

function getNodeCentroid(nodes: PhysicsNode[]): Point | undefined {
  if (nodes.length === 0) return undefined;

  return {
    x: nodes.reduce((total, node) => total + node.x, 0) / nodes.length,
    y: nodes.reduce((total, node) => total + node.y, 0) / nodes.length,
  };
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

function isLayerNode(node: PhysicsNode): boolean {
  return isLayerType(node.type);
}

function isLayerType(type: GraphNode["type"]): boolean {
  return type === "tag" || type === "customTag" || type === "statusTag";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
