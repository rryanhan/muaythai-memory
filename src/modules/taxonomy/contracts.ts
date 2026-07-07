import { z } from "zod";

// DTO schemas define the API shape we are willing to return to the frontend.
// They intentionally exclude parked concepts such as Core Idea.
export const trainingMethodDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  iconKey: z.string(),
  sortOrder: z.number().int(),
});

export const tagDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  kind: z.enum(["standard", "custom"]),
  sortOrder: z.number().int(),
  category: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable(),
});

export const tagCategoryDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  sortOrder: z.number().int(),
  tags: z.array(tagDtoSchema),
});

export const statusTagDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  sortOrder: z.number().int(),
});

export const taxonomyResponseSchema = z.object({
  trainingMethods: z.array(trainingMethodDtoSchema),
  tagCategories: z.array(tagCategoryDtoSchema),
  standardTags: z.array(tagDtoSchema),
  customTags: z.array(tagDtoSchema),
  statusTags: z.array(statusTagDtoSchema),
});

export type TrainingMethodDto = z.infer<typeof trainingMethodDtoSchema>;
export type TagDto = z.infer<typeof tagDtoSchema>;
export type TagCategoryDto = z.infer<typeof tagCategoryDtoSchema>;
export type StatusTagDto = z.infer<typeof statusTagDtoSchema>;
export type TaxonomyResponse = z.infer<typeof taxonomyResponseSchema>;
