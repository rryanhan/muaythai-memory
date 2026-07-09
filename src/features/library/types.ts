import type { DrillListResponse, StatusTagDto, TaxonomyResponse } from "@/data";

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

export type BuiltInStatusFilter = {
  id: string;
  icon: "star" | "target";
  label: string;
  slug: string;
  sortOrder: number;
};

export const emptyLibraryFilters: LibraryFilters = {
  keyword: "",
  methodSlug: null,
  tagSlugs: [],
  statusTagSlugs: [],
};

export type BuiltInStatusSource = Pick<StatusTagDto, "id" | "name" | "slug" | "sortOrder">;
