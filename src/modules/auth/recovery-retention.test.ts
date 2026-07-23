import { describe, expect, it } from "vitest";
import {
  getRecoveryGrantCleanupCutoff,
  normalizeRecoveryGrantCleanupBatchSize,
  RECOVERY_GRANT_AUDIT_RETENTION_MS,
  RECOVERY_GRANT_CLEANUP_BATCH_SIZE,
  RECOVERY_GRANT_MAX_CLEANUP_BATCH_SIZE,
} from "./recovery-retention";

describe("recovery grant retention", () => {
  it("retains grant audit records for 24 hours", () => {
    const now = new Date("2026-07-23T20:00:00.000Z");

    expect(getRecoveryGrantCleanupCutoff(now)).toEqual(
      new Date(now.getTime() - RECOVERY_GRANT_AUDIT_RETENTION_MS),
    );
    expect(RECOVERY_GRANT_AUDIT_RETENTION_MS).toBe(24 * 60 * 60 * 1_000);
  });

  it("keeps cleanup batches bounded", () => {
    expect(normalizeRecoveryGrantCleanupBatchSize()).toBe(
      RECOVERY_GRANT_CLEANUP_BATCH_SIZE,
    );
    expect(normalizeRecoveryGrantCleanupBatchSize(0)).toBe(
      RECOVERY_GRANT_CLEANUP_BATCH_SIZE,
    );
    expect(normalizeRecoveryGrantCleanupBatchSize(25)).toBe(25);
    expect(normalizeRecoveryGrantCleanupBatchSize(10_000)).toBe(
      RECOVERY_GRANT_MAX_CLEANUP_BATCH_SIZE,
    );
  });
});
