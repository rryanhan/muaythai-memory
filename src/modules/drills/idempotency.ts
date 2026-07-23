import { createHash } from "node:crypto";
import {
  createDrillInputSchema,
  type CreateDrillInput,
} from "./contracts";

const payloadVersion = "create-drill:v1";

export function createDrillPayloadHash(rawInput: CreateDrillInput): string {
  const input = createDrillInputSchema.parse(rawInput);
  const canonicalPayload = {
    title: input.title,
    summary: input.summary,
    notes: input.notes,
    steps: input.steps,
    trainingMethodSlugs: sortedUnique(input.trainingMethodSlugs),
    tagSlugs: sortedUnique(input.tagSlugs),
    statusTagSlugs: sortedUnique(input.statusTagSlugs),
  };

  return createHash("sha256")
    .update(payloadVersion)
    .update("\0")
    .update(JSON.stringify(canonicalPayload))
    .digest("hex");
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
