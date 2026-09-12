import {
  array as zArray,
  enum as zEnum,
  object as zObject,
  string as zString,
  type infer as ZodInfer,
} from "zod";
import { CAPTURE_LIMITS, DRILL_LIMITS } from "@/config/domain-limits";

const slugSchema = zString()
  .trim()
  .min(1)
  .max(DRILL_LIMITS.slugCharacters)
  .regex(/^[a-z0-9-]+$/);

export const captureDraftRequestSchema = zObject({
  transcript: zString()
    .trim()
    .min(12, "Describe the drill in a little more detail.")
    .max(
      CAPTURE_LIMITS.transcriptCharacters,
      `Keep the training note to ${CAPTURE_LIMITS.transcriptCharacters.toLocaleString()} characters or fewer.`,
    ),
});

export const captureDraftSchema = zObject({
  title: zString().trim().min(1).max(DRILL_LIMITS.titleCharacters),
  summary: zString().trim().min(1).max(DRILL_LIMITS.summaryCharacters),
  notes: zString().trim().max(DRILL_LIMITS.notesCharacters).nullable(),
  steps: zArray(zString().trim().min(1).max(DRILL_LIMITS.stepCharacters))
    .min(1)
    .max(DRILL_LIMITS.steps),
  trainingMethodSlugs: zArray(slugSchema).max(DRILL_LIMITS.trainingMethods),
  tagSlugs: zArray(slugSchema).max(DRILL_LIMITS.tags),
});

export const captureDraftResponseSchema = zObject({
  draft: captureDraftSchema,
  warnings: zArray(zString()),
});

export const captureTranscriptionResponseSchema = zObject({
  transcript: zString().trim().min(1).max(CAPTURE_LIMITS.transcriptCharacters),
});

const modelCaptureTextShape = {
  title: zString().max(DRILL_LIMITS.titleCharacters),
  summary: zString().min(1).max(DRILL_LIMITS.summaryCharacters),
  notes: zString().max(DRILL_LIMITS.notesCharacters).nullable(),
  steps: zArray(zString().max(DRILL_LIMITS.stepCharacters)).max(DRILL_LIMITS.steps),
};

// The broad schema supports shared types and offline fixtures. Live providers
// receive the stricter taxonomy-enum schema created below.
export const modelCaptureDraftSchema = zObject({
  ...modelCaptureTextShape,
  trainingMethodSlugs: zArray(slugSchema).max(DRILL_LIMITS.trainingMethods),
  tagSlugs: zArray(slugSchema).max(DRILL_LIMITS.tags),
});

export function createModelCaptureDraftSchema(
  trainingMethodSlugs: string[],
  tagSlugs: string[],
) {
  return zObject({
    ...modelCaptureTextShape,
    trainingMethodSlugs: zArray(toSlugEnum(trainingMethodSlugs, "Training Method"))
      .max(DRILL_LIMITS.trainingMethods),
    tagSlugs: zArray(toSlugEnum(tagSlugs, "standard tag")).max(DRILL_LIMITS.tags),
  });
}

export type CaptureModelSchema = ReturnType<typeof createModelCaptureDraftSchema>;

function toSlugEnum(values: string[], label: string) {
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length === 0) {
    throw new Error(`Capture requires at least one active ${label}.`);
  }
  return zEnum(uniqueValues as [string, ...string[]]);
}

export type CaptureDraftRequest = ZodInfer<typeof captureDraftRequestSchema>;
export type CaptureDraft = ZodInfer<typeof captureDraftSchema>;
export type CaptureDraftResponse = ZodInfer<typeof captureDraftResponseSchema>;
export type CaptureTranscriptionResponse = ZodInfer<typeof captureTranscriptionResponseSchema>;
export type ModelCaptureDraft = ZodInfer<typeof modelCaptureDraftSchema>;
