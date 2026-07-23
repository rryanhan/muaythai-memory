import { describe, expect, it } from "vitest";
import {
  createDrillPayloadHash,
  resolveDrillCreationLedgerEntry,
} from "./idempotency";

const input = {
  title: "Rear kick return",
  summary: "Recover stance after the kick.",
  notes: null,
  steps: ["Throw the rear kick.", "Return to stance."],
  trainingMethodSlugs: ["pad-work", "partner-drill"],
  tagSlugs: ["rear-kick", "balance"],
  statusTagSlugs: ["starred"],
};

describe("createDrillPayloadHash", () => {
  it("hashes normalized input deterministically and ignores relationship ordering", () => {
    const reordered = {
      ...input,
      title: `  ${input.title}  `,
      summary: ` ${input.summary} `,
      trainingMethodSlugs: ["partner-drill", "pad-work", "pad-work"],
      tagSlugs: ["balance", "rear-kick"],
      statusTagSlugs: ["starred", "starred"],
    };

    expect(createDrillPayloadHash(reordered)).toBe(createDrillPayloadHash(input));
    expect(createDrillPayloadHash(input)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps ordered steps and every editable field bound to the key", () => {
    expect(createDrillPayloadHash({
      ...input,
      steps: [...input.steps].reverse(),
    })).not.toBe(createDrillPayloadHash(input));

    expect(createDrillPayloadHash({
      ...input,
      title: "A different original title",
    })).not.toBe(createDrillPayloadHash(input));
  });

  it("distinguishes an existing drill, a deleted drill, and payload misuse", () => {
    const payloadHash = createDrillPayloadHash(input);
    const drillId = "00000000-0000-4000-8000-000000000001";

    expect(resolveDrillCreationLedgerEntry(
      { drillId, payloadHash },
      payloadHash,
    )).toEqual({ status: "existing", drillId });
    expect(resolveDrillCreationLedgerEntry(
      { drillId: null, payloadHash },
      payloadHash,
    )).toEqual({ status: "deleted" });
    expect(resolveDrillCreationLedgerEntry(
      { drillId: null, payloadHash },
      createDrillPayloadHash({ ...input, title: "Different request" }),
    )).toEqual({ status: "payload-mismatch" });
  });
});
