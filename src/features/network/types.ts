import type { DrillDetail, FilterMode, GraphOptions, GraphResponse } from "@/data";

export type NetworkLoadState =
  | { status: "loading" }
  | { status: "loaded"; graph: GraphResponse; refreshing: boolean; errorMessage?: string }
  | { status: "error"; message: string };

export type NetworkFilters = {
  methodSlugs: string[];
  keywords: string[];
  tagSlugs: string[];
  statusTagSlugs: string[];
  tagMode: FilterMode;
  statusMode: FilterMode;
};

export type NetworkGraphVisualState = {
  canHighlight: boolean;
  activeNodeIds: Set<string>;
  activeEdgeIds: Set<string>;
};

export type DrillDetailLoadState =
  | { status: "idle" }
  | { status: "loading"; drillId: string }
  | { status: "loaded"; drill: DrillDetail }
  | { status: "error"; drillId: string; message: string };

export const emptyNetworkFilters: NetworkFilters = {
  methodSlugs: [],
  keywords: [],
  tagSlugs: [],
  statusTagSlugs: [],
  tagMode: "all",
  statusMode: "all",
};

export const defaultNetworkLayerOptions: GraphOptions = {
  showTags: false,
  showCustomTags: false,
  showStatusTags: false,
};
