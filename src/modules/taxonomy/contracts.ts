import {
  array as zArray,
  enum as zEnum,
  number as zNumber,
  object as zObject,
  string as zString,
  type infer as ZodInfer,
} from "zod";

// DTO schemas define the API shape we are willing to return to the frontend.
// They intentionally exclude parked concepts such as Core Idea.
export const trainingMethodDtoSchema = zObject({
  id: zString().uuid(),
  name: zString(),
  slug: zString(),
  iconKey: zString(),
  sortOrder: zNumber().int(),
});

export const tagDtoSchema = zObject({
  id: zString().uuid(),
  name: zString(),
  slug: zString(),
  kind: zEnum(["standard", "custom"]),
  sortOrder: zNumber().int(),
  category: zObject({
    id: zString().uuid(),
    name: zString(),
    slug: zString(),
  })
    .nullable(),
});

export const tagCategoryDtoSchema = zObject({
  id: zString().uuid(),
  name: zString(),
  slug: zString(),
  sortOrder: zNumber().int(),
  tags: zArray(tagDtoSchema),
});

export const statusTagDtoSchema = zObject({
  id: zString().uuid(),
  name: zString(),
  slug: zString(),
  sortOrder: zNumber().int(),
});

export const taxonomyResponseSchema = zObject({
  trainingMethods: zArray(trainingMethodDtoSchema),
  tagCategories: zArray(tagCategoryDtoSchema),
  standardTags: zArray(tagDtoSchema),
  customTags: zArray(tagDtoSchema),
  statusTags: zArray(statusTagDtoSchema),
});

export type TrainingMethodDto = ZodInfer<typeof trainingMethodDtoSchema>;
export type TagDto = ZodInfer<typeof tagDtoSchema>;
export type TagCategoryDto = ZodInfer<typeof tagCategoryDtoSchema>;
export type StatusTagDto = ZodInfer<typeof statusTagDtoSchema>;
export type TaxonomyResponse = ZodInfer<typeof taxonomyResponseSchema>;
