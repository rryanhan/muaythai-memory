export type RejectedUploadStorageError = {
  message?: string;
};

export type RejectedUploadCleanupResult =
  | { ok: true }
  | { ok: false; stage: "storage" | "database"; error: unknown };

export async function cleanupRejectedJournalUpload(
  paths: string[],
  dependencies: {
    removeObjects: (paths: string[]) => Promise<{ error: RejectedUploadStorageError | null }>;
    deleteUploadRecord: () => Promise<void>;
  },
): Promise<RejectedUploadCleanupResult> {
  let removal: { error: RejectedUploadStorageError | null };
  try {
    removal = await dependencies.removeObjects(paths);
  } catch (error) {
    return { ok: false, stage: "storage", error };
  }

  if (removal.error) return { ok: false, stage: "storage", error: removal.error };
  try {
    await dependencies.deleteUploadRecord();
  } catch (error) {
    return { ok: false, stage: "database", error };
  }
  return { ok: true };
}
