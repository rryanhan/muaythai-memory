import {
  ApiError,
  ApiResponseValidationError,
  type DrillFilterInput,
  type GraphEdge,
  type GraphOptionsInput,
  type GraphNode,
  type GraphResponse,
} from "@/data";
import {
  defaultNetworkLayerOptions,
  emptyNetworkFilters,
  type NetworkFilters,
  type NetworkGraphVisualState,
} from "./types";

const methodOrder = ["pad-work", "bag-work", "partner-drill", "clinch", "technical-work"];

export function sortMethods(nodes: GraphNode[]): GraphNode[] {
  return [...nodes].sort((a, b) => getMethodRank(a.slug) - getMethodRank(b.slug));
}

export function buildGraphRequestKey(filters: NetworkFilters, layerOptions: GraphOptionsInput): string {
  return JSON.stringify({
    filters: normalizeNetworkFilters(filters),
    layerOptions: normalizeLayerOptions(layerOptions),
  });
}

export function normalizeNetworkFilters(filters: NetworkFilters): NetworkFilters {
  return {
    methodSlugs: normalizeSlugList(filters.methodSlugs),
    keywords: [...new Set(filters.keywords.map(normalizeKeyword).filter(Boolean))],
    tagSlugs: normalizeSlugList(filters.tagSlugs),
    statusTagSlugs: normalizeSlugList(filters.statusTagSlugs),
    tagMode: filters.tagMode ?? "all",
    statusMode: filters.statusMode ?? "all",
  };
}

export function normalizeLayerOptions(layerOptions: GraphOptionsInput): Required<GraphOptionsInput> {
  return {
    showTags: layerOptions.showTags ?? false,
    showCustomTags: layerOptions.showCustomTags ?? false,
    showStatusTags: layerOptions.showStatusTags ?? false,
  };
}

export function addPreviewKeyword(filters: NetworkFilters, previewKeyword: string): NetworkFilters {
  if (!previewKeyword) {
    return normalizeNetworkFilters(filters);
  }

  return normalizeNetworkFilters({
    ...filters,
    keywords: [...filters.keywords, previewKeyword],
  });
}

export function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function hasActiveFilters(filters: NetworkFilters): boolean {
  return (
    filters.methodSlugs.length > 0 ||
    filters.keywords.length > 0 ||
    filters.tagSlugs.length > 0 ||
    filters.statusTagSlugs.length > 0
  );
}

export function hasGraphFilters(graph: GraphResponse): boolean {
  const filters = graph.filters;

  return (
    filters.keywords.length > 0 ||
    filters.methodSlugs.length > 0 ||
    filters.tagSlugs.length > 0 ||
    filters.statusTagSlugs.length > 0
  );
}

export function graphFiltersMatchNetworkFilters(
  graphFilters: GraphResponse["filters"],
  filters: NetworkFilters,
): boolean {
  const normalizedFilters = normalizeNetworkFilters(filters);

  return (
    listsMatch(graphFilters.methodSlugs, normalizedFilters.methodSlugs) &&
    listsMatch(graphFilters.keywords.map(normalizeKeyword), normalizedFilters.keywords) &&
    listsMatch(graphFilters.tagSlugs, normalizedFilters.tagSlugs) &&
    listsMatch(graphFilters.statusTagSlugs, normalizedFilters.statusTagSlugs) &&
    graphFilters.tagMode === normalizedFilters.tagMode &&
    graphFilters.statusMode === normalizedFilters.statusMode
  );
}

export function isEmptyFilterSet(filters: NetworkFilters): boolean {
  return !hasActiveFilters(filters);
}

export function isDefaultLayerSet(layerOptions: GraphOptionsInput): boolean {
  const normalizedOptions = normalizeLayerOptions(layerOptions);

  return (
    normalizedOptions.showTags === defaultNetworkLayerOptions.showTags &&
    normalizedOptions.showCustomTags === defaultNetworkLayerOptions.showCustomTags &&
    normalizedOptions.showStatusTags === defaultNetworkLayerOptions.showStatusTags
  );
}

export function toDrillFilters(filters: NetworkFilters): DrillFilterInput {
  return {
    keywords: filters.keywords,
    methodSlugs: filters.methodSlugs,
    tagSlugs: filters.tagSlugs,
    statusTagSlugs: filters.statusTagSlugs,
    tagMode: filters.tagMode,
    statusMode: filters.statusMode,
  };
}

export function buildNetworkGraphVisualState(graph: GraphResponse, filters: NetworkFilters): NetworkGraphVisualState {
  if (graphFiltersMatchNetworkFilters(graph.filters, filters)) {
    return {
      canHighlight: hasGraphFilters(graph),
      activeNodeIds: new Set(graph.nodes.filter((node) => node.active).map((node) => node.id)),
      activeEdgeIds: new Set(graph.edges.filter((edge) => edge.active).map((edge) => edge.id)),
    };
  }

  const pendingMethodHighlight = buildPendingMethodHighlight(graph, filters);
  if (pendingMethodHighlight) {
    return {
      canHighlight: true,
      activeNodeIds: pendingMethodHighlight.activeNodeIds,
      activeEdgeIds: pendingMethodHighlight.activeEdgeIds,
    };
  }

  return {
    canHighlight: false,
    activeNodeIds: new Set(),
    activeEdgeIds: new Set(),
  };
}

function buildPendingMethodHighlight(
  graph: GraphResponse,
  filters: NetworkFilters,
): Omit<NetworkGraphVisualState, "canHighlight"> | null {
  const normalizedFilters = normalizeNetworkFilters(filters);
  const selectedMethodSlugs = new Set(normalizedFilters.methodSlugs);

  if (selectedMethodSlugs.size === 0 || hasNonMethodFilters(normalizedFilters)) {
    return null;
  }

  const selectedMethodNodeIds = new Set(
    graph.nodes
      .filter((node) => node.type === "trainingMethod" && node.slug && selectedMethodSlugs.has(node.slug))
      .map((node) => node.id),
  );

  if (selectedMethodNodeIds.size === 0) return null;

  const activeNodeIds = new Set(selectedMethodNodeIds);
  const activeEdgeIds = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.type !== "method") continue;

    const connectedDrillNodeId = getDrillNodeConnectedToSelectedMethod(edge, selectedMethodNodeIds);
    if (!connectedDrillNodeId) continue;

    activeEdgeIds.add(edge.id);
    activeNodeIds.add(connectedDrillNodeId);
  }

  return { activeNodeIds, activeEdgeIds };
}

export function getNetworkErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `The graph API returned ${error.status}.`;
  }

  if (error instanceof ApiResponseValidationError) {
    return "The graph API response no longer matches the frontend contract.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The graph could not be loaded.";
}

export function getDrillDetailErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return "That drill could not be found.";
    }

    return `The drill API returned ${error.status}.`;
  }

  if (error instanceof ApiResponseValidationError) {
    return "The drill detail response no longer matches the frontend contract.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The drill could not be loaded.";
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export { emptyNetworkFilters };

function getMethodRank(slug: string | undefined): number {
  if (!slug) return Number.MAX_SAFE_INTEGER;
  const rank = methodOrder.indexOf(slug);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

function listsMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}

function hasNonMethodFilters(filters: NetworkFilters): boolean {
  return filters.keywords.length > 0 || filters.tagSlugs.length > 0 || filters.statusTagSlugs.length > 0;
}

function getDrillNodeConnectedToSelectedMethod(
  edge: GraphEdge,
  selectedMethodNodeIds: Set<string>,
): string | null {
  if (selectedMethodNodeIds.has(edge.from) && edge.to.startsWith("drill:")) {
    return edge.to;
  }

  if (selectedMethodNodeIds.has(edge.to) && edge.from.startsWith("drill:")) {
    return edge.from;
  }

  return null;
}

function normalizeSlugList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}
