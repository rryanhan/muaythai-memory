import { ZodError } from "zod";
import { getTaxonomy } from "@/modules/taxonomy/queries";
import {
  captureDraftSchema,
  createModelCaptureDraftSchema,
  type CaptureDraft,
  type CaptureDraftResponse,
  type ModelCaptureDraft,
} from "./contracts";
import { CaptureDraftGenerationError } from "./errors";
import { getCaptureDraftProvider } from "./providers";
import type { TaxonomyResponse } from "@/modules/taxonomy/contracts";

export type GenerateCaptureDraftOptions = {
  signal?: AbortSignal;
};

export async function generateCaptureDraft(
  userId: string,
  transcript: string,
  options: GenerateCaptureDraftOptions = {},
): Promise<CaptureDraftResponse> {
  const taxonomy = await getTaxonomy(userId);
  const provider = getCaptureDraftProvider();
  const modelSchema = createModelCaptureDraftSchema(
    taxonomy.trainingMethods.map((method) => method.slug),
    taxonomy.standardTags.map((tag) => tag.slug),
  );
  const modelDraft = await provider.generate({
    instructions: buildCaptureInstructions(taxonomy),
    prompt: buildCaptureInput(transcript),
    schema: modelSchema,
    signal: options.signal,
  });

  try {
    return mergeCaptureCleanup(modelDraft);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new CaptureDraftGenerationError("The generated drill cleanup was incomplete.");
    }

    throw error;
  }
}

function mergeCaptureCleanup(
  modelDraft: ModelCaptureDraft,
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
    trainingMethodSlugs: unique(modelDraft.trainingMethodSlugs),
    tagSlugs: unique(modelDraft.tagSlugs),
  });

  const warnings =
    draft.trainingMethodSlugs.length === 0
      ? ["Choose at least one Training Method before saving."]
      : [];

  return { draft, warnings };
}

function buildCaptureInstructions(taxonomy: TaxonomyResponse): string {
  const trainingMethods = taxonomy.trainingMethods
    .map((method) => `${method.slug} (${method.name})`)
    .join(", ");
  const standardTags = taxonomy.standardTags
    .map((tag) => `${tag.slug} (${tag.name})`)
    .join(", ");

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
    "TRAINING METHODS: Select every method explicitly stated or directly described. A pad drill is Pad Work; work performed with another fighter is Partner Drill. Return only slugs from the allowed list.",
    `Allowed Training Methods: ${trainingMethods}`,
    "TAGS: Select every standard technique or mechanic that appears anywhere in the note, including optional branches and coaching cues. Review the full note before returning the array. Select nothing based only on a plausible benefit or broad association.",
    "Evidence rules: lead or rear hook supports hook; a cross supports cross; selling, faking, or disguising an attack to draw a reaction supports feint; changing the feet or moving into an explicitly named southpaw or orthodox stance supports stance-switch.",
    "A shift kick, switch kick, or described switch of the feet into a kick supports shift-kick and stance-switch. An explicitly named rear kick, rear body kick, or rear low kick supports rear-kick. Also include round-kick or low-kick only when that specific kick type is stated or directly described.",
    "Do not choose the nearest available technique tag for an unrepresented technique. A generic kick is not enough evidence for teep, round-kick, low-kick, shift-kick, or rear-kick. Do not select distance, timing, pressure, angle, or entry unless that concept is itself described as part of the drill. Pushing someone off balance alone is not distance or pressure.",
    "Taxonomy example note: This works on pads or with a partner. Throw a shift kick into southpaw, sell the kick with the hip, throw the cross, and optionally use a lead hook.",
    'Taxonomy example output: {"trainingMethodSlugs":["pad-work","partner-drill"],"tagSlugs":["cross","hook","shift-kick","stance-switch","feint"]}',
    `Allowed standard tags: ${standardTags}`,
    "Do not return custom tags, Saved Lists, Status Tags, Core Idea, or slugs outside these lists.",
    "Example original note: On pads, partner throws a cross. Slip outside, throw the left uppercut, then pivot right and reset. Keep the right hand high and do not bring the head back to center too early.",
    'Example output: {"title":"Cross Slip Uppercut Exit","summary":"Practice slipping outside the cross, returning with the left uppercut, and exiting on an angle.","notes":"Keep the right hand high and do not bring the head back to center too early.","steps":["Partner throws a cross on the pads.","Slip outside the cross.","Throw the left uppercut.","Pivot right and reset."],"trainingMethodSlugs":["pad-work","partner-drill"],"tagSlugs":["cross","slip","uppercut","pivot","angle"]}',
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
