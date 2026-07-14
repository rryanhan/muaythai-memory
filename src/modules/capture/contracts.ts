import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9-]+$/);

export const captureDraftRequestSchema = z.object({
  transcript: z.string().trim().min(12, "Describe the drill in a little more detail."),
});

export const captureDraftSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  notes: z.string().trim().nullable(),
  steps: z.array(z.string().trim().min(1)).min(1),
  trainingMethodSlugs: z.array(slugSchema),
  tagSlugs: z.array(slugSchema),
});

export const captureDraftResponseSchema = z.object({
  draft: captureDraftSchema,
  warnings: z.array(z.string()),
});

// The model-facing schema avoids transforms/defaults because strict structured
// output schemas work best when the model must explicitly fill every key.
export const modelCaptureDraftSchema = z.object({
  title: z.string(),
  summary: z.string().min(1),
  notes: z.string().nullable(),
  steps: z.array(z.string()),
});

export type CaptureDraftRequest = z.infer<typeof captureDraftRequestSchema>;
export type CaptureDraft = z.infer<typeof captureDraftSchema>;
export type CaptureDraftResponse = z.infer<typeof captureDraftResponseSchema>;
export type ModelCaptureDraft = z.infer<typeof modelCaptureDraftSchema>;
