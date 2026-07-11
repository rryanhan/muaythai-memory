import type { DrillListResponse, TaxonomyResponse } from "@/data";
import type { BuiltInStatusFilter, BuiltInStatusSource } from "@/features/shared/tag-filter-helpers";

export type { BuiltInStatusFilter, BuiltInStatusSource };

export type LibraryFilters = {
  keyword: string;
  methodSlug: string | null;
  tagSlugs: string[];
  statusTagSlugs: string[];
};

export type TaxonomyLoadState =
  | { status: "loading" }
  | { status: "loaded"; taxonomy: TaxonomyResponse }
  | { status: "error"; message: string };

export type DrillListLoadState =
  | { status: "loading" }
  | { status: "loaded"; response: DrillListResponse; refreshing: boolean; errorMessage?: string }
  | { status: "error"; message: string };

export type FilterPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; total: number }
  | { status: "error"; message: string };

export const emptyLibraryFilters: LibraryFilters = {
  keyword: "",
  methodSlug: null,
  tagSlugs: [],
  statusTagSlugs: [],
};
