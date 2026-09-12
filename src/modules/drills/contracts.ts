import {
  array as zArray,
  boolean as zBoolean,
  coerce as zCoerce,
  enum as zEnum,
  number as zNumber,
  object as zObject,
  string as zString,
  type infer as ZodInfer,
  type input as ZodInput,
} from "zod";
import { DRILL_LIMITS } from "@/config/domain-limits";
import { statusTagDtoSchema, tagDtoSchema, trainingMethodDtoSchema } from "@/modules/taxonomy/contracts";

const slugSchema = zString()
  .trim()
  .min(1)
  .max(DRILL_LIMITS.slugCharacters)
  .regex(/^[a-z0-9-]+$/);

const drillTitleSchema = zString().trim().min(1).max(DRILL_LIMITS.titleCharacters);
const drillSummaryTextSchema = zString().max(DRILL_LIMITS.summaryCharacters);
const drillNotesSchema = zString().max(DRILL_LIMITS.notesCharacters);
const drillStepBodySchema = zString().trim().min(1).max(DRILL_LIMITS.stepCharacters);

// "all" means every selected tag/status must be present. "any" lets search
// panels preview broader results without changing the underlying taxonomy.
export const filterModeSchema = zEnum(["all", "any"]);

export const drillFiltersSchema = zObject({
  keywords: zArray(zString().trim().min(1).max(DRILL_LIMITS.filterKeywordCharacters))
    .max(DRILL_LIMITS.filterKeywords)
    .default([]),
  methodSlugs: zArray(slugSchema).max(DRILL_LIMITS.trainingMethods).default([]),
  tagSlugs: zArray(slugSchema).max(DRILL_LIMITS.tags).default([]),
  statusTagSlugs: zArray(slugSchema).max(DRILL_LIMITS.savedLists).default([]),
  tagMode: filterModeSchema.default("all"),
  statusMode: filterModeSchema.default("all"),
});

export const drillSummarySchema = zObject({
  id: zString().uuid(),
  title: drillTitleSchema,
  summary: drillSummaryTextSchema,
  trainingMethods: zArray(trainingMethodDtoSchema),
  tags: zArray(tagDtoSchema),
  customTags: zArray(tagDtoSchema),
  statusTags: zArray(statusTagDtoSchema),
  createdAt: zCoerce.date(),
  updatedAt: zCoerce.date(),
});

export const drillDetailSchema = drillSummarySchema.extend({
  notes: drillNotesSchema.nullable(),
  steps: zArray(
    zObject({
      id: zString().uuid(),
      position: zNumber().int(),
      body: drillStepBodySchema,
    }),
  ),
});

export const drillListResponseSchema = zObject({
  drills: zArray(drillSummarySchema),
  total: zNumber().int().nonnegative(),
  filters: drillFiltersSchema,
});

export const drillDetailResponseSchema = zObject({
  drill: drillDetailSchema,
});

export const deleteDrillResponseSchema = zObject({
  deletedId: zString().uuid(),
});

export const savedListSlugSchema = zEnum(["starred", "drill-back-in"]);

export const updateSavedListInputSchema = zObject({
  slug: savedListSlugSchema,
  selected: zBoolean(),
});

export const updateSavedListResponseSchema = zObject({
  drillId: zString().uuid(),
  status: statusTagDtoSchema,
  selected: zBoolean(),
});

export const createDrillInputSchema = zObject({
  title: drillTitleSchema,
  summary: zString()
    .trim()
    .max(DRILL_LIMITS.summaryCharacters)
    .optional()
    .nullable()
    .transform((value) => value ?? ""),
  notes: zString()
    .trim()
    .max(DRILL_LIMITS.notesCharacters)
    .optional()
    .nullable()
    .transform((value) => value || null),
  steps: zArray(drillStepBodySchema).min(1).max(DRILL_LIMITS.steps),
  trainingMethodSlugs: zArray(slugSchema).min(1).max(DRILL_LIMITS.trainingMethods),
  tagSlugs: zArray(slugSchema).max(DRILL_LIMITS.tags).default([]),
  statusTagSlugs: zArray(slugSchema).max(DRILL_LIMITS.savedLists).default([]),
});

// Edit Drill v1 uses the same editable fields as manual creation. The API
// treats updates as a full replacement of relationships and ordered steps.
export const updateDrillInputSchema = createDrillInputSchema;

export type FilterMode = ZodInfer<typeof filterModeSchema>;
export type DrillFilters = ZodInfer<typeof drillFiltersSchema>;
export type DrillSummary = ZodInfer<typeof drillSummarySchema>;
export type DrillDetail = ZodInfer<typeof drillDetailSchema>;
export type DrillListResponse = ZodInfer<typeof drillListResponseSchema>;
export type DeleteDrillResponse = ZodInfer<typeof deleteDrillResponseSchema>;
export type SavedListSlug = ZodInfer<typeof savedListSlugSchema>;
export type UpdateSavedListInput = ZodInfer<typeof updateSavedListInputSchema>;
export type UpdateSavedListResponse = ZodInfer<typeof updateSavedListResponseSchema>;
export type CreateDrillInput = ZodInput<typeof createDrillInputSchema>;
export type UpdateDrillInput = ZodInput<typeof updateDrillInputSchema>;

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
