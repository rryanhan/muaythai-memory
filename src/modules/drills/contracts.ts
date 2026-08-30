import { z } from "zod";
import { DRILL_LIMITS } from "@/config/domain-limits";
import { statusTagDtoSchema, tagDtoSchema, trainingMethodDtoSchema } from "@/modules/taxonomy/contracts";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(DRILL_LIMITS.slugCharacters)
  .regex(/^[a-z0-9-]+$/);

const drillTitleSchema = z.string().trim().min(1).max(DRILL_LIMITS.titleCharacters);
const drillSummaryTextSchema = z.string().max(DRILL_LIMITS.summaryCharacters);
const drillNotesSchema = z.string().max(DRILL_LIMITS.notesCharacters);
const drillStepBodySchema = z.string().trim().min(1).max(DRILL_LIMITS.stepCharacters);

// "all" means every selected tag/status must be present. "any" lets search
// panels preview broader results without changing the underlying taxonomy.
export const filterModeSchema = z.enum(["all", "any"]);

export const drillFiltersSchema = z.object({
  keywords: z
    .array(z.string().trim().min(1).max(DRILL_LIMITS.filterKeywordCharacters))
    .max(DRILL_LIMITS.filterKeywords)
    .default([]),
  methodSlugs: z.array(slugSchema).max(DRILL_LIMITS.trainingMethods).default([]),
  tagSlugs: z.array(slugSchema).max(DRILL_LIMITS.tags).default([]),
  statusTagSlugs: z.array(slugSchema).max(DRILL_LIMITS.savedLists).default([]),
  tagMode: filterModeSchema.default("all"),
  statusMode: filterModeSchema.default("all"),
});

export const drillSummarySchema = z.object({
  id: z.string().uuid(),
  title: drillTitleSchema,
  summary: drillSummaryTextSchema,
  trainingMethods: z.array(trainingMethodDtoSchema),
  tags: z.array(tagDtoSchema),
  customTags: z.array(tagDtoSchema),
  statusTags: z.array(statusTagDtoSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const drillDetailSchema = drillSummarySchema.extend({
  notes: drillNotesSchema.nullable(),
  steps: z.array(
    z.object({
      id: z.string().uuid(),
      position: z.number().int(),
      body: drillStepBodySchema,
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

export const deleteDrillResponseSchema = z.object({
  deletedId: z.string().uuid(),
});

export const savedListSlugSchema = z.enum(["starred", "drill-back-in"]);

export const updateSavedListInputSchema = z.object({
  slug: savedListSlugSchema,
  selected: z.boolean(),
});

export const updateSavedListResponseSchema = z.object({
  drillId: z.string().uuid(),
  status: statusTagDtoSchema,
  selected: z.boolean(),
});

export const createDrillInputSchema = z.object({
  title: drillTitleSchema,
  summary: z
    .string()
    .trim()
    .max(DRILL_LIMITS.summaryCharacters)
    .optional()
    .nullable()
    .transform((value) => value ?? ""),
  notes: z
    .string()
    .trim()
    .max(DRILL_LIMITS.notesCharacters)
    .optional()
    .nullable()
    .transform((value) => value || null),
  steps: z.array(drillStepBodySchema).min(1).max(DRILL_LIMITS.steps),
  trainingMethodSlugs: z.array(slugSchema).min(1).max(DRILL_LIMITS.trainingMethods),
  tagSlugs: z.array(slugSchema).max(DRILL_LIMITS.tags).default([]),
  statusTagSlugs: z.array(slugSchema).max(DRILL_LIMITS.savedLists).default([]),
});

// Edit Drill v1 uses the same editable fields as manual creation. The API
// treats updates as a full replacement of relationships and ordered steps.
export const updateDrillInputSchema = createDrillInputSchema;

export type FilterMode = z.infer<typeof filterModeSchema>;
export type DrillFilters = z.infer<typeof drillFiltersSchema>;
export type DrillSummary = z.infer<typeof drillSummarySchema>;
export type DrillDetail = z.infer<typeof drillDetailSchema>;
export type DrillListResponse = z.infer<typeof drillListResponseSchema>;
export type DeleteDrillResponse = z.infer<typeof deleteDrillResponseSchema>;
export type SavedListSlug = z.infer<typeof savedListSlugSchema>;
export type UpdateSavedListInput = z.infer<typeof updateSavedListInputSchema>;
export type UpdateSavedListResponse = z.infer<typeof updateSavedListResponseSchema>;
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
