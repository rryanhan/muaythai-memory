import type { UseQueryResult } from "@tanstack/react-query";
import {
  ApiError,
  ApiResponseValidationError,
  type DrillFilterInput,
  type DrillListResponse,
  type StatusTagDto,
  type TagDto,
  type TaxonomyResponse,
} from "@/data";
import type {
  BuiltInStatusFilter,
  DrillListLoadState,
  FilterPreviewState,
  LibraryFilters,
  TaxonomyLoadState,
} from "./types";

const builtInStatusDisplayNames: Record<string, string> = {
  starred: "Favourite",
  "drill-back-in": "Drill Back In",
};

const builtInStatusIcons: Record<string, BuiltInStatusFilter["icon"]> = {
  starred: "star",
  "drill-back-in": "target",
};

const builtInStatusSlugs = ["starred", "drill-back-in"];

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

export function filterTagCategories(
  tagCategories: TaxonomyResponse["tagCategories"],
  query: string,
  selectedTagSet: Set<string>,
): TaxonomyResponse["tagCategories"] {
  return tagCategories
    .map((category) => {
      const categoryMatches = query.length > 0 && category.name.toLowerCase().includes(query);
      const tags = category.tags.filter((tag) => tagMatchesQuery(tag, query, categoryMatches, selectedTagSet));

      return { ...category, tags };
    })
    .filter((category) => category.tags.length > 0);
}

export function filterTags(tags: TagDto[], query: string, selectedTagSet: Set<string>): TagDto[] {
  return tags.filter((tag) => tagMatchesQuery(tag, query, false, selectedTagSet));
}

export function filterBuiltInStatuses(
  statuses: BuiltInStatusFilter[],
  query: string,
  selectedStatusSet: Set<string>,
): BuiltInStatusFilter[] {
  return statuses.filter((status) => {
    if (selectedStatusSet.has(status.slug)) return true;
    if (!query) return true;

    return status.label.toLowerCase().includes(query) || status.slug.includes(query);
  });
}

export function getBuiltInStatusFilters(statusTags: StatusTagDto[]): BuiltInStatusFilter[] {
  return builtInStatusSlugs
    .map((slug) => statusTags.find((status) => status.slug === slug))
    .filter((status): status is StatusTagDto => Boolean(status))
    .map((status) => ({
      id: status.id,
      icon: builtInStatusIcons[status.slug] ?? "star",
      label: builtInStatusDisplayNames[status.slug] ?? status.name,
      slug: status.slug,
      sortOrder: status.sortOrder,
    }))
    .sort((first, second) => first.sortOrder - second.sortOrder);
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

function tagMatchesQuery(tag: TagDto, query: string, categoryMatches: boolean, selectedTagSet: Set<string>): boolean {
  if (selectedTagSet.has(tag.slug)) return true;
  if (!query) return true;
  return categoryMatches || tag.name.toLowerCase().includes(query) || tag.slug.includes(query);
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
