import type { DrillDetail, GraphResponse } from "@/data";

export type NetworkLoadState =
  | { status: "loading" }
  | { status: "loaded"; graph: GraphResponse; refreshing: boolean; errorMessage?: string }
  | { status: "error"; message: string };

export type NetworkFilters = {
  methodSlug: string | null;
  keywords: string[];
};

export type DrillDetailLoadState =
  | { status: "idle" }
  | { status: "loading"; drillId: string }
  | { status: "loaded"; drill: DrillDetail }
  | { status: "error"; drillId: string; message: string };

export const emptyNetworkFilters: NetworkFilters = {
  methodSlug: null,
  keywords: [],
};

export const graphLayerOptions = {
  showTags: false,
  showCustomTags: false,
  showStatusTags: false,
};
