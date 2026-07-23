export type RejectedUploadStorageError = {
  message?: string;
};

export type RejectedUploadCleanupResult =
  | { ok: true }
  | { ok: false; error: unknown };

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
    return { ok: false, error };
  }

  if (removal.error) return { ok: false, error: removal.error };
  await dependencies.deleteUploadRecord();
  return { ok: true };
}
