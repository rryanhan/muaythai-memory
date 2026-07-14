import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mergeDrillCleanup, type DrillDirtyFields } from "@/features/drills/cleanup-merge";
import { modelCaptureDraftSchema } from "./contracts";
import { parseCaptureTranscript } from "./parser";
import {
  standardTagSeeds,
  statusTagSeeds,
  tagCategorySeeds,
  trainingMethodSeeds,
} from "@/modules/taxonomy/seed-data";
import type { TaxonomyResponse } from "@/modules/taxonomy/contracts";

const taxonomy = buildTaxonomy();

verifyParser();
verifyCaptureContract();
verifyCleanupMerge();
console.log("Capture verification passed: taxonomy, required summary, and cleanup merge behavior are stable.");

function verifyParser() {
  expectCapture(
    "Bag round. Jab cross, rear low kick, reset, then add a teep. Stay balanced.",
    ["bag-work"],
    ["jab", "cross", "low-kick", "teep"],
  );
  expectCapture(
    "Partner feeds a jab. Parry with the rear hand, throw the rear knee, then angle off.",
    ["partner-drill"],
    ["jab", "parry", "knee", "angle"],
  );
  expectCapture("In the clinch, pummel to a rear knee and sweep.", ["clinch"], ["knee", "sweep"]);
  expectCapture(
    "Shadowbox the switch step into a lead teep and pivot out.",
    ["technical-work"],
    ["shadowboxing", "switch-step", "teep", "pivot"],
  );
  expectCapture(
    "Partner holds pads for a one-two and low kick.",
    ["partner-drill", "pad-work"],
    ["jab", "cross", "low-kick"],
  );
  expectCapture("On pads, throw a check hook and pivot out.", ["pad-work"], ["hook", "pivot"], ["kick-check"]);
  expectCapture(
    "Partner drill: catch the body kick, step outside, and sweep.",
    ["partner-drill"],
    ["kick-catch", "round-kick", "sweep"],
  );
  expectCapture(
    "Technical work: step through to southpaw, throw the cross, then step to orthodox.",
    ["technical-work"],
    ["step-through", "stance-switch", "cross"],
  );

  const missingMethod = parseCaptureTranscript("Jab, cross, low kick, then reset and keep the chin tucked.", taxonomy);
  assert.equal(missingMethod.trainingMethodSlugs.length, 0);
  assert.ok(missingMethod.warnings.some((warning) => warning.includes("Training Method")));
}

function verifyCaptureContract() {
  const baseDraft = {
    title: "Cross Slip Uppercut Exit",
    notes: "Keep the right hand high.",
    steps: ["Slip outside the cross.", "Throw the left uppercut."],
  };

  assert.equal(
    modelCaptureDraftSchema.safeParse({ ...baseDraft, summary: null }).success,
    false,
    "Model summary should not accept null.",
  );
  assert.equal(
    modelCaptureDraftSchema.safeParse({ ...baseDraft, summary: "" }).success,
    false,
    "Model summary should not accept an empty string.",
  );
  assert.equal(
    modelCaptureDraftSchema.safeParse({ ...baseDraft, summary: "Practice the slip, uppercut, and exit sequence." }).success,
    true,
    "Model summary should accept a factual sentence.",
  );
}

function verifyCleanupMerge() {
  const current = {
    title: "My edited title",
    summary: "",
    notes: "Original cue",
    steps: ["User-edited step"],
  };
  const dirty: DrillDirtyFields = {
    title: true,
    summary: false,
    notes: false,
    steps: true,
  };
  const suggestion = {
    title: "AI title",
    summary: "AI summary",
    notes: "Cleaned cue",
    steps: ["AI step one", "AI step two"],
  };
  const result = mergeDrillCleanup(current, dirty, suggestion);

  assert.equal(result.applied.title, current.title, "Dirty title should not be replaced.");
  assert.deepEqual(result.applied.steps, current.steps, "Dirty steps should remain one owned collection.");
  assert.equal(result.applied.summary, suggestion.summary, "Untouched summary should update.");
  assert.equal(result.applied.notes, suggestion.notes, "Untouched notes should update.");
  assert.equal(result.pending.title, suggestion.title, "Dirty title should be offered for review.");
  assert.deepEqual(result.pending.steps, suggestion.steps, "Dirty steps should be offered for review.");
  assert.equal(result.pending.summary, undefined);
  assert.equal(result.pending.notes, undefined);
}

function expectCapture(
  transcript: string,
  expectedMethods: string[],
  expectedTags: string[],
  absentTags: string[] = [],
) {
  const result = parseCaptureTranscript(transcript, taxonomy);
  const methods = new Set(result.trainingMethodSlugs);
  const tags = new Set(result.tagSlugs);

  for (const method of expectedMethods) assert.ok(methods.has(method), `Expected ${method} for: ${transcript}`);
  for (const tag of expectedTags) assert.ok(tags.has(tag), `Expected ${tag} for: ${transcript}`);
  for (const tag of absentTags) assert.ok(!tags.has(tag), `Did not expect ${tag} for: ${transcript}`);
}

function buildTaxonomy(): TaxonomyResponse {
  const categories = tagCategorySeeds.map((category) => ({
    ...category,
    id: randomUUID(),
    tags: [] as TaxonomyResponse["standardTags"],
  }));
  const categoriesBySlug = new Map(categories.map((category) => [category.slug, category]));
  const standardTags = standardTagSeeds.map((tag) => {
    const category = categoriesBySlug.get(tag.categorySlug);
    assert.ok(category, `Missing category ${tag.categorySlug}`);
    const dto: TaxonomyResponse["standardTags"][number] = {
      id: randomUUID(),
      name: tag.name,
      slug: tag.slug,
      kind: "standard",
      sortOrder: tag.sortOrder,
      category: { id: category.id, name: category.name, slug: category.slug },
    };
    category.tags.push(dto);
    return dto;
  });

  return {
    trainingMethods: trainingMethodSeeds.map((method) => ({ ...method, id: randomUUID() })),
    tagCategories: categories,
    standardTags,
    customTags: [],
    statusTags: statusTagSeeds.map((status) => ({ ...status, id: randomUUID() })),
  };
}
