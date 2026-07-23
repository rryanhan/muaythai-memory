import { createHash } from "node:crypto";
import {
  createDrillInputSchema,
  type CreateDrillInput,
} from "./contracts";

const payloadVersion = "create-drill:v1";

export type DrillCreationLedgerEntry = {
  drillId: string | null;
  payloadHash: string;
};

export type DrillCreationLedgerResolution =
  | { status: "existing"; drillId: string }
  | { status: "deleted" }
  | { status: "payload-mismatch" };

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

export function resolveDrillCreationLedgerEntry(
  entry: DrillCreationLedgerEntry,
  requestedPayloadHash: string,
): DrillCreationLedgerResolution {
  if (entry.payloadHash !== requestedPayloadHash) {
    return { status: "payload-mismatch" };
  }
  if (!entry.drillId) {
    return { status: "deleted" };
  }
  return { status: "existing", drillId: entry.drillId };
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
