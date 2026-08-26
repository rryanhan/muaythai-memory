import { describe, expect, it } from "vitest";
import { DRILL_LIMITS } from "@/config/domain-limits";
import {
  createDrillInputSchema,
  drillFiltersSchema,
} from "./contracts";

const baseInput = {
  title: "Rear kick return",
  summary: "",
  notes: null,
  steps: ["Throw the rear kick."],
  trainingMethodSlugs: ["pad-work"],
  tagSlugs: [],
  statusTagSlugs: [],
};

describe("drill input boundaries", () => {
  it("accepts every exact character and collection boundary", () => {
    expect(createDrillInputSchema.safeParse({
      ...baseInput,
      title: "t".repeat(DRILL_LIMITS.titleCharacters),
      summary: "s".repeat(DRILL_LIMITS.summaryCharacters),
      notes: "n".repeat(DRILL_LIMITS.notesCharacters),
      steps: Array.from(
        { length: DRILL_LIMITS.steps },
        (_, index) => `${index}`.padEnd(DRILL_LIMITS.stepCharacters, "x"),
      ),
      trainingMethodSlugs: Array.from(
        { length: DRILL_LIMITS.trainingMethods },
        (_, index) => `method-${index}`,
      ),
      tagSlugs: Array.from({ length: DRILL_LIMITS.tags }, (_, index) => `tag-${index}`),
      statusTagSlugs: ["starred", "drill-back-in"],
    }).success).toBe(true);
  });

  it.each([
    ["title", { title: "t".repeat(DRILL_LIMITS.titleCharacters + 1) }],
    ["summary", { summary: "s".repeat(DRILL_LIMITS.summaryCharacters + 1) }],
    ["notes", { notes: "n".repeat(DRILL_LIMITS.notesCharacters + 1) }],
    ["step body", { steps: ["s".repeat(DRILL_LIMITS.stepCharacters + 1)] }],
    ["step count", { steps: Array(DRILL_LIMITS.steps + 1).fill("Step") }],
    [
      "Training Method count",
      {
        trainingMethodSlugs: Array.from(
          { length: DRILL_LIMITS.trainingMethods + 1 },
          (_, index) => `method-${index}`,
        ),
      },
    ],
    [
      "tag count",
      { tagSlugs: Array.from({ length: DRILL_LIMITS.tags + 1 }, (_, index) => `tag-${index}`) },
    ],
    ["Saved List count", { statusTagSlugs: ["starred", "drill-back-in", "third-list"] }],
  ])("rejects an oversized %s", (_label, change) => {
    expect(createDrillInputSchema.safeParse({ ...baseInput, ...change }).success).toBe(false);
  });

  it("bounds filter keywords and slugs", () => {
    const baseFilters = {
      keywords: [],
      methodSlugs: [],
      tagSlugs: [],
      statusTagSlugs: [],
      tagMode: "all" as const,
      statusMode: "all" as const,
    };

    expect(drillFiltersSchema.safeParse({
      ...baseFilters,
      keywords: Array(DRILL_LIMITS.filterKeywords).fill(
        "k".repeat(DRILL_LIMITS.filterKeywordCharacters),
      ),
    }).success).toBe(true);
    expect(drillFiltersSchema.safeParse({
      ...baseFilters,
      keywords: Array(DRILL_LIMITS.filterKeywords + 1).fill("kick"),
    }).success).toBe(false);
    expect(drillFiltersSchema.safeParse({
      ...baseFilters,
      tagSlugs: ["s".repeat(DRILL_LIMITS.slugCharacters + 1)],
    }).success).toBe(false);
  });
});
