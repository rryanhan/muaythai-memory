import type { UseQueryResult } from "@tanstack/react-query";
import {
  ApiError,
  ApiResponseValidationError,
  type DrillFilterInput,
  type DrillListResponse,
  type TaxonomyResponse,
} from "@/data";
import {
  filterBuiltInStatuses,
  filterTagCategories,
  filterTags,
  getBuiltInStatusFilters,
} from "@/features/shared/tag-filter-helpers";
import type {
  DrillListLoadState,
  FilterPreviewState,
  LibraryFilters,
  TaxonomyLoadState,
} from "./types";

export { filterBuiltInStatuses, filterTagCategories, filterTags, getBuiltInStatusFilters };

export function toDrillFilters(filters: LibraryFilters): DrillFilterInput {
  const keyword = normalizeKeyword(filters.keyword);

  return {
    keywords: keyword ? [keyword] : [],
    methodSlugs: filters.methodSlug ? [filters.methodSlug] : [],
    tagSlugs: filters.tagSlugs,
    statusTagSlugs: filters.statusTagSlugs,
    tagMode: "all",
    statusMode: "all",
  };
}

export function toTaxonomyState(query: UseQueryResult<TaxonomyResponse, Error>): TaxonomyLoadState {
  if (query.data) {
    return { status: "loaded", taxonomy: query.data };
  }

  if (query.isError) {
    return { status: "error", message: getLibraryErrorMessage(query.error, "taxonomy") };
  }

  return { status: "loading" };
}

export function toDrillListState(query: UseQueryResult<DrillListResponse, Error>): DrillListLoadState {
  if (query.data) {
    return {
      status: "loaded",
      response: query.data,
      refreshing: query.isFetching && !query.isLoading,
      errorMessage: query.isError ? getLibraryErrorMessage(query.error, "drills") : undefined,
    };
  }

  if (query.isError) {
    return { status: "error", message: getLibraryErrorMessage(query.error, "drills") };
  }

  return { status: "loading" };
}

export function toPreviewState(
  query: UseQueryResult<DrillListResponse, Error>,
  enabled: boolean,
): FilterPreviewState {
  if (!enabled) {
    return { status: "idle" };
  }

  if (query.data) {
    return { status: "loaded", total: query.data.total };
  }

  if (query.isError) {
    return { status: "error", message: getLibraryErrorMessage(query.error, "drills") };
  }

  return { status: "loading" };
}

export function hasActiveFilters(filters: LibraryFilters): boolean {
  return (
    Boolean(normalizeKeyword(filters.keyword)) ||
    Boolean(filters.methodSlug) ||
    filters.tagSlugs.length > 0 ||
    filters.statusTagSlugs.length > 0
  );
}

export function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function formatDrillCount(total: number): string {
  return `${total} captured ${total === 1 ? "drill" : "drills"}`;
}

export function formatDraftFilterCount(total: number): string {
  return `${total} ${total === 1 ? "filter" : "filters"} selected`;
}

export function getPreviewMessage(previewState: FilterPreviewState): string {
  if (previewState.status === "loading") return "Checking matching drills";
  if (previewState.status === "loaded") {
    return `${previewState.total} matching ${previewState.total === 1 ? "drill" : "drills"}`;
  }
  if (previewState.status === "error") return previewState.message;
  return "Select filters, then apply";
}

function getLibraryErrorMessage(error: unknown, resource: "taxonomy" | "drills"): string {
  if (error instanceof ApiError) {
    return `The ${resource} API returned ${error.status}.`;
  }

  if (error instanceof ApiResponseValidationError) {
    return `The ${resource} response no longer matches the frontend contract.`;
  }

  return `The ${resource} could not be loaded.`;
}
