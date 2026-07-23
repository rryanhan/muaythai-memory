export const RECOVERY_GRANT_AUDIT_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const RECOVERY_GRANT_CLEANUP_BATCH_SIZE = 100;
export const RECOVERY_GRANT_MAX_CLEANUP_BATCH_SIZE = 500;

export function getRecoveryGrantCleanupCutoff(now: Date): Date {
  return new Date(now.getTime() - RECOVERY_GRANT_AUDIT_RETENTION_MS);
}

export function normalizeRecoveryGrantCleanupBatchSize(value?: number): number {
  if (!Number.isInteger(value) || (value ?? 0) < 1) {
    return RECOVERY_GRANT_CLEANUP_BATCH_SIZE;
  }

  return Math.min(value as number, RECOVERY_GRANT_MAX_CLEANUP_BATCH_SIZE);
}
