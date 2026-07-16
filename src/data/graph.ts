import { graphResponseSchema } from "@/modules/graph/contracts";
import type {
  ApiClientOptions,
  DrillFilterInput,
  GraphOptionsInput,
  GraphResponse,
} from "./types";
import { fetchJson } from "./api-core";
import { appendBoolean, appendQueryString, buildDrillSearchParams } from "./filter-query";

export async function getGraph(
  filters: DrillFilterInput = {},
  graphOptions: GraphOptionsInput = {},
  options: ApiClientOptions = {},
): Promise<GraphResponse> {
  return fetchJson(buildGraphApiPath(filters, graphOptions), graphResponseSchema, options);
}

export function buildGraphApiPath(
  filters: DrillFilterInput = {},
  graphOptions: GraphOptionsInput = {},
): string {
  const searchParams = buildDrillSearchParams(filters);
  appendBoolean(searchParams, "showTags", graphOptions.showTags);
  appendBoolean(searchParams, "showCustomTags", graphOptions.showCustomTags);
  appendBoolean(searchParams, "showStatusTags", graphOptions.showStatusTags);
  return appendQueryString("/api/graph", searchParams);
}
