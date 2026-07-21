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

export const captureTranscriptionResponseSchema = z.object({
  transcript: z.string().trim().min(1),
});

const modelCaptureTextShape = {
  title: z.string(),
  summary: z.string().min(1),
  notes: z.string().nullable(),
  steps: z.array(z.string()),
};

// The broad schema supports shared types and offline fixtures. Live providers
// receive the stricter taxonomy-enum schema created below.
export const modelCaptureDraftSchema = z.object({
  ...modelCaptureTextShape,
  trainingMethodSlugs: z.array(slugSchema),
  tagSlugs: z.array(slugSchema),
});

export function createModelCaptureDraftSchema(
  trainingMethodSlugs: string[],
  tagSlugs: string[],
) {
  return z.object({
    ...modelCaptureTextShape,
    trainingMethodSlugs: z.array(toSlugEnum(trainingMethodSlugs, "Training Method")),
    tagSlugs: z.array(toSlugEnum(tagSlugs, "standard tag")),
  });
}

export type CaptureModelSchema = ReturnType<typeof createModelCaptureDraftSchema>;

function toSlugEnum(values: string[], label: string) {
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length === 0) {
    throw new Error(`Capture requires at least one active ${label}.`);
  }
  return z.enum(uniqueValues as [string, ...string[]]);
}

export type CaptureDraftRequest = z.infer<typeof captureDraftRequestSchema>;
export type CaptureDraft = z.infer<typeof captureDraftSchema>;
export type CaptureDraftResponse = z.infer<typeof captureDraftResponseSchema>;
export type CaptureTranscriptionResponse = z.infer<typeof captureTranscriptionResponseSchema>;
export type ModelCaptureDraft = z.infer<typeof modelCaptureDraftSchema>;
