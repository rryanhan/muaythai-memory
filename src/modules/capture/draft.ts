import { ZodError } from "zod";
import { getTaxonomy } from "@/modules/taxonomy/queries";
import {
  captureDraftSchema,
  type CaptureDraft,
  type CaptureDraftResponse,
  type ModelCaptureDraft,
} from "./contracts";
import { CaptureDraftGenerationError } from "./errors";
import { parseCaptureTranscript } from "./parser";
import { getCaptureDraftProvider } from "./providers";

export type GenerateCaptureDraftOptions = {
  signal?: AbortSignal;
};

export async function generateCaptureDraft(
  transcript: string,
  options: GenerateCaptureDraftOptions = {},
): Promise<CaptureDraftResponse> {
  const taxonomy = await getTaxonomy();
  const deterministicResult = parseCaptureTranscript(transcript, taxonomy);
  const provider = getCaptureDraftProvider();
  const modelDraft = await provider.generate({
    instructions: buildCaptureInstructions(),
    prompt: buildCaptureInput(transcript),
    signal: options.signal,
  });

  try {
    return mergeCaptureCleanup(modelDraft, deterministicResult);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new CaptureDraftGenerationError("The generated drill cleanup was incomplete.");
    }

    throw error;
  }
}

function mergeCaptureCleanup(
  modelDraft: ModelCaptureDraft,
  deterministicResult: ReturnType<typeof parseCaptureTranscript>,
): CaptureDraftResponse {
  const cleanedSteps = unique(modelDraft.steps.map((step) => step.trim()).filter(Boolean));
  const cleanedTitle = modelDraft.title.trim();
  const cleanedSummary = modelDraft.summary.trim();

  if (!cleanedTitle || !cleanedSummary || cleanedSteps.length === 0) {
    throw new CaptureDraftGenerationError("The generated drill cleanup was incomplete.");
  }

  const draft: CaptureDraft = captureDraftSchema.parse({
    title: cleanedTitle,
    summary: cleanedSummary,
    notes: normalizeOptionalText(modelDraft.notes),
    steps: cleanedSteps,
    trainingMethodSlugs: deterministicResult.trainingMethodSlugs,
    tagSlugs: deterministicResult.tagSlugs,
  });

  return { draft, warnings: deterministicResult.warnings };
}

function buildCaptureInstructions(): string {
  return [
    "Turn a messy Muay Thai training note into clean drill text fields.",
    "Return only the requested structured fields.",
    "Use practical, concise, coach-like language.",
    "TITLE: Give the drill a short name based only on the stated sequence.",
    "SUMMARY: Always return exactly one short factual sentence describing what the drill practices. Do not invent benefits or objectives.",
    "STEPS: Include only ordered, observable actions that answer: What happens next? Keep each step physical and specific.",
    "NOTES: Put guard, posture, pacing, reminders, constraints, common mistakes, and how-to-perform cues here. Return null only when the source contains no such cues.",
    "Classification test: an action that advances the sequence is a step; advice about how to perform an action or what to avoid is a note.",
    "Never duplicate a note as a step. Instructions such as keep the right hand high or do not return the head to center early are notes, never steps.",
    "Preserve the order, side, stance, target, and mechanics stated in the original note.",
    "Do not add techniques, targets, stance details, coaching cues, or mechanics that are not in the note.",
    "Example original note: On pads, partner throws a cross. Slip outside, throw the left uppercut, then pivot right and reset. Keep the right hand high and do not bring the head back to center too early.",
    'Example output: {"title":"Cross Slip Uppercut Exit","summary":"Practice slipping outside the cross, returning with the left uppercut, and exiting on an angle.","notes":"Keep the right hand high and do not bring the head back to center too early.","steps":["Partner throws a cross on the pads.","Slip outside the cross.","Throw the left uppercut.","Pivot right and reset."]}',
  ].join("\n");
}

function buildCaptureInput(transcript: string): string {
  return ["Original training note:", transcript].join("\n");
}

function normalizeOptionalText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
