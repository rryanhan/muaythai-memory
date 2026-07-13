import { z } from "zod";
import { statusTagDtoSchema, tagDtoSchema, trainingMethodDtoSchema } from "@/modules/taxonomy/contracts";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9-]+$/);

// "all" means every selected tag/status must be present. "any" lets search
// panels preview broader results without changing the underlying taxonomy.
export const filterModeSchema = z.enum(["all", "any"]);

export const drillFiltersSchema = z.object({
  keywords: z.array(z.string().trim().min(1)).default([]),
  methodSlugs: z.array(slugSchema).default([]),
  tagSlugs: z.array(slugSchema).default([]),
  statusTagSlugs: z.array(slugSchema).default([]),
  tagMode: filterModeSchema.default("all"),
  statusMode: filterModeSchema.default("all"),
});

export const drillSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  summary: z.string(),
  trainingMethods: z.array(trainingMethodDtoSchema),
  tags: z.array(tagDtoSchema),
  customTags: z.array(tagDtoSchema),
  statusTags: z.array(statusTagDtoSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const drillDetailSchema = drillSummarySchema.extend({
  notes: z.string().nullable(),
  steps: z.array(
    z.object({
      id: z.string().uuid(),
      position: z.number().int(),
      body: z.string(),
    }),
  ),
});

export const drillListResponseSchema = z.object({
  drills: z.array(drillSummarySchema),
  total: z.number().int().nonnegative(),
  filters: drillFiltersSchema,
});

export const drillDetailResponseSchema = z.object({
  drill: drillDetailSchema,
});

export const createDrillInputSchema = z.object({
  title: z.string().trim().min(1),
  summary: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value ?? ""),
  notes: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || null),
  steps: z.array(z.string().trim().min(1)).min(1),
  trainingMethodSlugs: z.array(slugSchema).min(1),
  tagSlugs: z.array(slugSchema).default([]),
  statusTagSlugs: z.array(slugSchema).default([]),
});

// Edit Drill v1 uses the same editable fields as manual creation. The API
// treats updates as a full replacement of relationships and ordered steps.
export const updateDrillInputSchema = createDrillInputSchema;

export type FilterMode = z.infer<typeof filterModeSchema>;
export type DrillFilters = z.infer<typeof drillFiltersSchema>;
export type DrillSummary = z.infer<typeof drillSummarySchema>;
export type DrillDetail = z.infer<typeof drillDetailSchema>;
export type DrillListResponse = z.infer<typeof drillListResponseSchema>;
export type DrillDetailResponse = z.infer<typeof drillDetailResponseSchema>;
export type CreateDrillInput = z.input<typeof createDrillInputSchema>;
export type UpdateDrillInput = z.input<typeof updateDrillInputSchema>;

// Route handlers accept a few alias names so the frontend can evolve without
// forcing a backend rewrite for every query-string naming change.
export function parseDrillFiltersFromSearchParams(searchParams: URLSearchParams): DrillFilters {
  const rawFilters = {
    keywords: collectSearchValues(searchParams, ["q", "query", "search", "keyword", "keywords"]),
    methodSlugs: collectSearchValues(searchParams, ["method", "methods", "methodSlug", "methodSlugs"]),
    tagSlugs: collectSearchValues(searchParams, ["tag", "tags", "tagSlug", "tagSlugs"]),
    statusTagSlugs: collectSearchValues(searchParams, [
      "status",
      "statuses",
      "statusTag",
      "statusTags",
      "statusTagSlug",
      "statusTagSlugs",
    ]),
    tagMode: searchParams.get("tagMode") ?? "all",
    statusMode: searchParams.get("statusMode") ?? "all",
  };

  return drillFiltersSchema.parse(rawFilters);
}

function collectSearchValues(searchParams: URLSearchParams, keys: string[]): string[] {
  const values: string[] = [];

  for (const key of keys) {
    for (const value of searchParams.getAll(key)) {
      values.push(...splitListParam(value));
    }
  }

  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function splitListParam(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
