import {
  ApiError,
  ApiResponseValidationError,
  type DrillFilterInput,
  type GraphNode,
  type GraphResponse,
} from "@/data";
import { emptyNetworkFilters, type NetworkFilters } from "./types";

const methodOrder = ["pad-work", "bag-work", "partner-drill", "clinch", "technical-work"];

export function sortMethods(nodes: GraphNode[]): GraphNode[] {
  return [...nodes].sort((a, b) => getMethodRank(a.slug) - getMethodRank(b.slug));
}

export function buildFilterKey(filters: NetworkFilters): string {
  return JSON.stringify(normalizeNetworkFilters(filters));
}

export function normalizeNetworkFilters(filters: NetworkFilters): NetworkFilters {
  return {
    methodSlug: filters.methodSlug,
    keywords: [...new Set(filters.keywords.map(normalizeKeyword).filter(Boolean))],
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
  return Boolean(filters.methodSlug) || filters.keywords.length > 0;
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
  const graphMethodSlug = graphFilters.methodSlugs.length === 1 ? graphFilters.methodSlugs[0] : null;

  return (
    graphMethodSlug === normalizedFilters.methodSlug &&
    listsMatch(graphFilters.keywords.map(normalizeKeyword), normalizedFilters.keywords)
  );
}

export function isEmptyFilterSet(filters: NetworkFilters): boolean {
  return !hasActiveFilters(filters);
}

export function toDrillFilters(filters: NetworkFilters): DrillFilterInput {
  return {
    keywords: filters.keywords,
    methodSlugs: filters.methodSlug ? [filters.methodSlug] : [],
  };
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
