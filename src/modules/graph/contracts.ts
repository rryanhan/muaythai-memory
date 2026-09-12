import {
  array as zArray,
  boolean as zBoolean,
  enum as zEnum,
  object as zObject,
  string as zString,
  type infer as ZodInfer,
} from "zod";
import { drillFiltersSchema, parseDrillFiltersFromSearchParams } from "@/modules/drills/contracts";

// Graph payloads are intentionally lightweight: enough to render nodes/edges,
// not full drill detail records.
export const graphNodeTypeSchema = zEnum(["trainingMethod", "drill", "tag", "customTag", "statusTag"]);
export const graphEdgeTypeSchema = zEnum(["method", "tag", "customTag", "statusTag"]);

export const graphNodeSchema = zObject({
  id: zString(),
  entityId: zString().uuid(),
  type: graphNodeTypeSchema,
  label: zString(),
  slug: zString().optional(),
  iconKey: zString().optional(),
  active: zBoolean(),
  matched: zBoolean(),
  selected: zBoolean(),
});

export const graphEdgeSchema = zObject({
  id: zString(),
  from: zString(),
  to: zString(),
  type: graphEdgeTypeSchema,
  active: zBoolean(),
});

export const graphOptionsSchema = zObject({
  showTags: zBoolean().default(false),
  showCustomTags: zBoolean().default(false),
  showStatusTags: zBoolean().default(false),
});

export const graphResponseSchema = zObject({
  nodes: zArray(graphNodeSchema),
  edges: zArray(graphEdgeSchema),
  filters: drillFiltersSchema,
  options: graphOptionsSchema,
});

export type GraphNode = ZodInfer<typeof graphNodeSchema>;
export type GraphEdge = ZodInfer<typeof graphEdgeSchema>;
export type GraphOptions = ZodInfer<typeof graphOptionsSchema>;
export type GraphResponse = ZodInfer<typeof graphResponseSchema>;

export function parseGraphRequestFromSearchParams(searchParams: URLSearchParams) {
  return {
    filters: parseDrillFiltersFromSearchParams(searchParams),
    options: graphOptionsSchema.parse({
      showTags: parseBooleanParam(searchParams, "showTags") ?? parseBooleanParam(searchParams, "tags") ?? false,
      showCustomTags:
        parseBooleanParam(searchParams, "showCustomTags") ?? parseBooleanParam(searchParams, "customTags") ?? false,
      showStatusTags:
        parseBooleanParam(searchParams, "showStatusTags") ?? parseBooleanParam(searchParams, "statusTags") ?? false,
    }),
  };
}

function parseBooleanParam(searchParams: URLSearchParams, key: string): boolean | undefined {
  const value = searchParams.get(key);
  if (value === null) return undefined;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
