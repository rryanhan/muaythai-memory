import { z } from "zod";
import { drillFiltersSchema, parseDrillFiltersFromSearchParams } from "@/modules/drills/contracts";

// Graph payloads are intentionally lightweight: enough to render nodes/edges,
// not full drill detail records.
export const graphNodeTypeSchema = z.enum(["trainingMethod", "drill", "tag", "customTag", "statusTag"]);
export const graphEdgeTypeSchema = z.enum(["method", "tag", "customTag", "statusTag"]);

export const graphNodeSchema = z.object({
  id: z.string(),
  entityId: z.string().uuid(),
  type: graphNodeTypeSchema,
  label: z.string(),
  slug: z.string().optional(),
  iconKey: z.string().optional(),
  active: z.boolean(),
  matched: z.boolean(),
  selected: z.boolean(),
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: graphEdgeTypeSchema,
  active: z.boolean(),
});

export const graphOptionsSchema = z.object({
  showTags: z.boolean().default(false),
  showCustomTags: z.boolean().default(false),
  showStatusTags: z.boolean().default(false),
});

export const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  filters: drillFiltersSchema,
  options: graphOptionsSchema,
});

export type GraphNodeType = z.infer<typeof graphNodeTypeSchema>;
export type GraphEdgeType = z.infer<typeof graphEdgeTypeSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphOptions = z.infer<typeof graphOptionsSchema>;
export type GraphResponse = z.infer<typeof graphResponseSchema>;

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
