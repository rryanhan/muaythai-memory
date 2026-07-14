import type { TaxonomyResponse, TagDto, TrainingMethodDto } from "@/modules/taxonomy/contracts";

export type CaptureTaxonomyResult = {
  trainingMethodSlugs: string[];
  tagSlugs: string[];
  warnings: string[];
};

type AliasMap = Record<string, string[]>;

const methodAliases: AliasMap = {
  "pad-work": ["pad work", "pads", "thai pads", "pad holder", "on the pads", "mitts"],
  "bag-work": ["bag work", "bag round", "heavy bag", "punching bag", "on the bag", "bag"],
  "partner-drill": ["partner drill", "partner feeds", "partner throws", "with a partner", "one for one", "partner"],
  clinch: ["clinch", "clinch work", "pummel", "pummeling", "neck wrestling", "thai plum", "plum"],
  "technical-work": ["technical work", "line drill", "mirror drill", "solo drill", "shadowbox", "shadowboxing"],
};

const tagAliases: AliasMap = {
  jab: ["jab", "lead straight", "one two", "1 2"],
  cross: ["cross", "rear straight", "straight right", "straight left", "one two", "1 2"],
  hook: ["hook", "lead hook", "rear hook"],
  uppercut: ["uppercut", "lead uppercut", "rear uppercut"],
  "body-shot": ["body shot", "body punch", "shot to the body"],
  teep: ["teep", "push kick", "front kick"],
  "round-kick": ["round kick", "roundhouse", "body kick", "head kick", "middle kick"],
  "low-kick": ["low kick", "leg kick", "calf kick", "inside low kick", "outside low kick"],
  knee: ["knee", "knees", "knee strike", "lead knee", "rear knee", "long knee"],
  elbow: ["elbow", "elbows", "elbow strike"],
  "kick-check": ["kick check", "check the kick", "check a kick", "check low kick", "checking the kick"],
  "kick-catch": ["kick catch", "catch the kick", "catch a kick", "catch body kick", "catch the body kick"],
  parry: ["parry", "parries"],
  "long-guard": ["long guard", "long frame"],
  slip: ["slip", "slipping"],
  roll: ["roll under", "roll", "rolling"],
  pivot: ["pivot", "pivoting"],
  "switch-step": ["switch step", "switch kick"],
  "step-through": ["step through", "step-through"],
  "stance-switch": ["stance switch", "switch stance", "change stance", "step to southpaw", "step to orthodox"],
  sweep: ["sweep", "sweeps", "dump"],
  entry: ["entry", "enter range", "close distance", "step inside"],
  angle: ["angle", "angle off", "angle out"],
  distance: ["distance", "manage range", "make space", "range"],
  timing: ["timing", "time the shot", "time the strike"],
  pressure: ["pressure", "walk down", "press forward"],
  feint: ["feint", "feints", "fake", "fakes"],
  shadowboxing: ["shadowbox", "shadowboxing", "shadow box"],
};

/**
 * Matches only explicit taxonomy without trying to write the drill. AI owns
 * title, summary, notes, and steps; this parser makes method/tag selection feel
 * immediate while the cleanup request is running.
 */
export function parseCaptureTranscript(transcript: string, taxonomy: TaxonomyResponse): CaptureTaxonomyResult {
  const normalizedTranscript = normalizeForMatching(transcript);
  const matchedMethods = findMethods(normalizedTranscript, taxonomy.trainingMethods);
  const matchedTags = findTags(normalizedTranscript, taxonomy.standardTags);
  const warnings: string[] = [];

  if (matchedMethods.length === 0) {
    warnings.push("Choose at least one Training Method before saving.");
  }

  return {
    trainingMethodSlugs: matchedMethods.map((match) => match.item.slug),
    tagSlugs: matchedTags.map((match) => match.item.slug),
    warnings,
  };
}

type Match<T> = {
  item: T;
  index: number;
};

function findMethods(normalizedTranscript: string, methods: TrainingMethodDto[]): Match<TrainingMethodDto>[] {
  return methods
    .map((method) => ({
      item: method,
      index: findFirstAlias(normalizedTranscript, [method.name, method.slug, ...(methodAliases[method.slug] ?? [])]),
    }))
    .filter((match) => match.index >= 0)
    .sort(compareMatches);
}

function findTags(normalizedTranscript: string, tags: TagDto[]): Match<TagDto>[] {
  return tags
    .map((tag) => ({
      item: tag,
      index: findFirstAlias(normalizedTranscript, [tag.name, tag.slug, ...(tagAliases[tag.slug] ?? [])]),
    }))
    .filter((match) => match.index >= 0)
    .sort(compareMatches);
}

function findFirstAlias(normalizedTranscript: string, aliases: string[]): number {
  const paddedTranscript = ` ${normalizedTranscript} `;
  let firstIndex = -1;

  for (const alias of aliases) {
    const normalizedAlias = normalizeForMatching(alias);
    if (!normalizedAlias) continue;
    const index = paddedTranscript.indexOf(` ${normalizedAlias} `);
    if (index >= 0 && (firstIndex < 0 || index < firstIndex)) firstIndex = index;
  }

  return firstIndex;
}

function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compareMatches<T>(left: Match<T>, right: Match<T>): number {
  return left.index - right.index;
}
