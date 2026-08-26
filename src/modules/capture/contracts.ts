import { z } from "zod";
import { CAPTURE_LIMITS, DRILL_LIMITS } from "@/config/domain-limits";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(DRILL_LIMITS.slugCharacters)
  .regex(/^[a-z0-9-]+$/);

export const captureDraftRequestSchema = z.object({
  transcript: z
    .string()
    .trim()
    .min(12, "Describe the drill in a little more detail.")
    .max(
      CAPTURE_LIMITS.transcriptCharacters,
      `Keep the training note to ${CAPTURE_LIMITS.transcriptCharacters.toLocaleString()} characters or fewer.`,
    ),
});

export const captureDraftSchema = z.object({
  title: z.string().trim().min(1).max(DRILL_LIMITS.titleCharacters),
  summary: z.string().trim().min(1).max(DRILL_LIMITS.summaryCharacters),
  notes: z.string().trim().max(DRILL_LIMITS.notesCharacters).nullable(),
  steps: z
    .array(z.string().trim().min(1).max(DRILL_LIMITS.stepCharacters))
    .min(1)
    .max(DRILL_LIMITS.steps),
  trainingMethodSlugs: z.array(slugSchema).max(DRILL_LIMITS.trainingMethods),
  tagSlugs: z.array(slugSchema).max(DRILL_LIMITS.tags),
});

export const captureDraftResponseSchema = z.object({
  draft: captureDraftSchema,
  warnings: z.array(z.string()),
});

export const captureTranscriptionResponseSchema = z.object({
  transcript: z.string().trim().min(1).max(CAPTURE_LIMITS.transcriptCharacters),
});

const modelCaptureTextShape = {
  title: z.string().max(DRILL_LIMITS.titleCharacters),
  summary: z.string().min(1).max(DRILL_LIMITS.summaryCharacters),
  notes: z.string().max(DRILL_LIMITS.notesCharacters).nullable(),
  steps: z.array(z.string().max(DRILL_LIMITS.stepCharacters)).max(DRILL_LIMITS.steps),
};

// The broad schema supports shared types and offline fixtures. Live providers
// receive the stricter taxonomy-enum schema created below.
export const modelCaptureDraftSchema = z.object({
  ...modelCaptureTextShape,
  trainingMethodSlugs: z.array(slugSchema).max(DRILL_LIMITS.trainingMethods),
  tagSlugs: z.array(slugSchema).max(DRILL_LIMITS.tags),
});

export function createModelCaptureDraftSchema(
  trainingMethodSlugs: string[],
  tagSlugs: string[],
) {
  return z.object({
    ...modelCaptureTextShape,
    trainingMethodSlugs: z
      .array(toSlugEnum(trainingMethodSlugs, "Training Method"))
      .max(DRILL_LIMITS.trainingMethods),
    tagSlugs: z.array(toSlugEnum(tagSlugs, "standard tag")).max(DRILL_LIMITS.tags),
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
