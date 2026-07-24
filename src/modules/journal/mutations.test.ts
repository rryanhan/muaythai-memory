import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UploadRow = {
  createdAt: Date;
  deletedAt: Date | null;
  id: string;
  mediaOperation: string | null;
  mediaOperationStartedAt: Date | null;
  mediaOperationToken: string | null;
  mediaId: string;
  mimeType: string;
  posterPath: string | null;
  sizeBytes: number;
  status: string;
  storagePath: string;
  userId: string;
};

const mocks = vi.hoisted(() => ({
  activeTransactions: 0,
  afterAbandonedScan: null as (() => void) | null,
  bucketCreateSignedUploadUrl: vi.fn(),
  bucketInfo: vi.fn(),
  bucketList: vi.fn(),
  bucketRemove: vi.fn(),
  createJournalPosterObjectPath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  deleteFailures: 0,
  forUpdate: vi.fn(),
  getJournalEntryById: vi.fn(),
  getOwnedJournalRow: vi.fn(),
  missingRemovalsReturnNotFound: false,
  objects: [] as string[],
  posterPaths: [] as string[],
  removeFailures: 0,
  row: null as UploadRow | null,
  selectAbandonedRows: vi.fn(),
  storageCallsInsideTransactions: [] as string[],
  tombstoneFailures: 0,
  transaction: vi.fn(),
  updateFailures: 0,
  uploadJournalPosterObject: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    select: mocks.selectAbandonedRows,
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("./poster", () => ({
  createJournalPosterObjectPath: mocks.createJournalPosterObjectPath,
  uploadJournalPosterObject: mocks.uploadJournalPosterObject,
}));

vi.mock("./queries", () => ({
  getJournalEntryById: mocks.getJournalEntryById,
  getOwnedJournalRow: mocks.getOwnedJournalRow,
}));

import {
  cleanupAbandonedJournalUploads,
  completeJournalUpload,
  deleteJournalEntry,
  refreshJournalUploadIntent,
  saveJournalPoster,
} from "./mutations";

const oldPosterPath = "user/entry/poster-11111111-1111-4111-8111-111111111111.webp";
const firstPosterPath = "user/entry/poster-22222222-2222-4222-8222-222222222222.webp";
const secondPosterPath = "user/entry/poster-33333333-3333-4333-8333-333333333333.webp";
const otherEntryPosterPath = "user/other-entry/poster-44444444-4444-4444-8444-444444444444.webp";
const otherUserPosterPath = "other-user/entry/poster-55555555-5555-4555-8555-555555555555.webp";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.supabase.co";
  mocks.activeTransactions = 0;
  mocks.afterAbandonedScan = null;
  mocks.bucketCreateSignedUploadUrl.mockReset().mockResolvedValue({
    data: { token: "fresh-upload-token" },
    error: null,
  });
  mocks.bucketInfo.mockReset();
  mocks.bucketList.mockReset().mockImplementation(async (
    prefix: string,
    options: { limit: number; offset: number },
  ) => {
    const directChildren = mocks.objects
      .filter((path) => path.startsWith(`${prefix}/`) && !path.slice(prefix.length + 1).includes("/"))
      .map((path) => ({ name: path.slice(prefix.length + 1) }));
    return {
      data: directChildren.slice(options.offset, options.offset + options.limit),
      error: null,
    };
  });
  mocks.bucketRemove.mockReset().mockImplementation(async (paths: string[]) => {
    if (mocks.removeFailures > 0) {
      mocks.removeFailures -= 1;
      return {
        data: null,
        error: { message: "Storage unavailable", status: 503, statusCode: "503" },
      };
    }
    const found = paths.some((path) => mocks.objects.includes(path));
    if (!found && mocks.missingRemovalsReturnNotFound) {
      return {
        data: null,
        error: { message: "Object not found", status: 404, statusCode: "404" },
      };
    }
    mocks.objects = mocks.objects.filter((path) => !paths.includes(path));
    return { data: [], error: null };
  });
  mocks.createJournalPosterObjectPath.mockReset().mockImplementation(
    () => mocks.posterPaths.shift() ?? firstPosterPath,
  );
  mocks.createSupabaseAdminClient.mockReset().mockReturnValue({
    storage: {
      from: () => ({
        createSignedUploadUrl: (...args: unknown[]) => {
          recordStorageCall("signed upload token");
          return mocks.bucketCreateSignedUploadUrl(...args);
        },
        info: (...args: unknown[]) => {
          recordStorageCall("info");
          return mocks.bucketInfo(...args);
        },
        list: (...args: unknown[]) => {
          recordStorageCall("list");
          return mocks.bucketList(...args);
        },
        remove: (...args: unknown[]) => {
          recordStorageCall("remove");
          return mocks.bucketRemove(...args);
        },
      }),
    },
  });
  mocks.deleteFailures = 0;
  mocks.forUpdate.mockReset();
  mocks.getJournalEntryById.mockReset().mockImplementation(
    async () => mocks.row?.status === "ready" ? { id: "entry" } : null,
  );
  mocks.getOwnedJournalRow.mockReset().mockImplementation(
    async () => mocks.row ? { ...mocks.row } : null,
  );
  mocks.missingRemovalsReturnNotFound = false;
  mocks.objects = ["user/entry/video.mp4", oldPosterPath];
  mocks.posterPaths = [firstPosterPath];
  mocks.removeFailures = 0;
  mocks.row = uploadRow();
  mocks.selectAbandonedRows.mockReset().mockImplementation(() => {
    const builder = chainBuilder();
    builder.where = vi.fn(async () => {
      const row = mocks.row;
      const rows = row && (
        row.status === "uploading"
        || row.status === "deleted"
        || row.mediaOperation === "delete"
        || row.mediaOperation === "cleanup"
      )
        ? [{
            id: row.id,
            userId: row.userId,
            storagePath: row.storagePath,
            posterPath: row.posterPath,
          }]
        : [];
      const afterScan = mocks.afterAbandonedScan;
      mocks.afterAbandonedScan = null;
      afterScan?.();
      return rows;
    });
    return builder;
  });
  mocks.updateFailures = 0;
  mocks.storageCallsInsideTransactions = [];
  mocks.tombstoneFailures = 0;
  mocks.uploadJournalPosterObject.mockReset().mockImplementation(async (
    _userId: string,
    _entryId: string,
    _file: File,
    path: string,
  ) => {
    recordStorageCall("poster upload");
    mocks.objects.push(path);
    return path;
  });
  installSerializedTransactions();
});

afterEach(() => {
  expect(mocks.storageCallsInsideTransactions).toEqual([]);
});

describe("journal upload token refresh", () => {
  it("issues a new token for the same owned uploading object path", async () => {
    await expect(refreshJournalUploadIntent("user", "entry")).resolves.toEqual({
      entryId: "entry",
      upload: {
        endpoint: "https://staging.storage.supabase.co/storage/v1/upload/resumable/sign",
        path: "user/entry/video.mp4",
        token: "fresh-upload-token",
      },
    });

    expect(mocks.bucketCreateSignedUploadUrl).toHaveBeenCalledWith(
      "user/entry/video.mp4",
      { upsert: false },
    );
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "uploading",
      storagePath: "user/entry/video.mp4",
    });
  });

  it("does not return a signed token after delete supersedes a delayed refresh", async () => {
    const signedToken = deferred<{
      data: { token: string };
      error: null;
    }>();
    mocks.bucketCreateSignedUploadUrl.mockReturnValue(signedToken.promise);

    const refresh = refreshJournalUploadIntent("user", "entry");
    const refreshFailure = expect(refresh).rejects.toThrow(/changed while access was being refreshed/);
    await vi.waitFor(() => expect(mocks.bucketCreateSignedUploadUrl).toHaveBeenCalledOnce());

    await expect(deleteJournalEntry("user", "entry")).resolves.toBe("entry");
    signedToken.resolve({ data: { token: "too-late-token" }, error: null });
    await refreshFailure;

    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "deleted",
    });
    expect(mocks.objects).toEqual([]);
  });

  it("releases a failed token claim so the same entry can obtain a fresh token", async () => {
    mocks.bucketCreateSignedUploadUrl
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockResolvedValueOnce({ data: { token: "retry-token" }, error: null });

    await expect(refreshJournalUploadIntent("user", "entry"))
      .rejects.toThrow("Storage unavailable");
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "uploading",
      storagePath: "user/entry/video.mp4",
    });

    await expect(refreshJournalUploadIntent("user", "entry"))
      .resolves.toMatchObject({
        entryId: "entry",
        upload: {
          path: "user/entry/video.mp4",
          token: "retry-token",
        },
      });
    expect(mocks.bucketCreateSignedUploadUrl).toHaveBeenCalledTimes(2);
  });
});

describe("journal media operation claims", () => {
  it("keeps delayed completion Storage I/O outside the claim transaction and blocks a new poster", async () => {
    const info = deferred<{
      data: { contentType: string; size: number };
      error: null;
    }>();
    mocks.bucketInfo.mockReturnValue(info.promise);

    const completion = completeJournalUpload("user", "entry");
    await vi.waitFor(() => expect(mocks.bucketInfo).toHaveBeenCalledOnce());
    const posterSave = saveJournalPoster(
      "user",
      "entry",
      new File(["poster"], "poster.webp", { type: "image/webp" }),
    );
    const posterFailure = expect(posterSave).rejects.toThrow(/already being finalized or removed/);
    await vi.waitFor(() => expect(mocks.forUpdate).toHaveBeenCalledTimes(2));
    expect(mocks.uploadJournalPosterObject).not.toHaveBeenCalled();

    info.resolve({ data: { contentType: "video/mp4", size: 10 }, error: null });

    await expect(completion).resolves.toEqual({ id: "entry" });
    await posterFailure;
    expect(mocks.row).toMatchObject({
      posterPath: oldPosterPath,
      status: "ready",
    });
    expect(mocks.bucketRemove).not.toHaveBeenCalled();
    expect(mocks.objects).toContain(oldPosterPath);
    expect(mocks.forUpdate).toHaveBeenCalledTimes(3);
  });

  it("lets completion supersede a delayed poster and removes only the losing UUID path", async () => {
    const posterUpload = deferred<void>();
    mocks.uploadJournalPosterObject.mockImplementation(async (
      _userId: string,
      _entryId: string,
      _file: File,
      path: string,
    ) => {
      recordStorageCall("poster upload");
      await posterUpload.promise;
      mocks.objects.push(path);
      return path;
    });
    mocks.bucketInfo.mockResolvedValue({
      data: { contentType: "video/mp4", size: 10 },
      error: null,
    });

    const posterSave = saveJournalPoster(
      "user",
      "entry",
      new File(["poster"], "poster.webp", { type: "image/webp" }),
    );
    const posterFailure = expect(posterSave).rejects.toThrow(/only be added while the video is uploading/);
    await vi.waitFor(() => expect(mocks.uploadJournalPosterObject).toHaveBeenCalledOnce());

    await expect(completeJournalUpload("user", "entry")).resolves.toEqual({ id: "entry" });
    posterUpload.resolve();
    await posterFailure;

    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      posterPath: oldPosterPath,
      status: "ready",
    });
    expect(mocks.bucketRemove).toHaveBeenCalledWith([firstPosterPath]);
    expect(mocks.objects).toEqual(["user/entry/video.mp4", oldPosterPath]);
  });

  it("uses the newest poster claim and never deletes the winning current poster", async () => {
    const firstUpload = deferred<void>();
    const secondUpload = deferred<void>();
    mocks.posterPaths = [firstPosterPath, secondPosterPath];
    mocks.uploadJournalPosterObject.mockImplementation(async (
      _userId: string,
      _entryId: string,
      _file: File,
      path: string,
    ) => {
      recordStorageCall("poster upload");
      await (path === firstPosterPath ? firstUpload.promise : secondUpload.promise);
      mocks.objects.push(path);
      return path;
    });

    const firstSave = saveJournalPoster(
      "user",
      "entry",
      new File(["first"], "first.webp", { type: "image/webp" }),
    );
    const firstFailure = expect(firstSave).rejects.toThrow(/only be added while the video is uploading/);
    await vi.waitFor(() => expect(mocks.uploadJournalPosterObject).toHaveBeenCalledOnce());
    const secondSave = saveJournalPoster(
      "user",
      "entry",
      new File(["second"], "second.webp", { type: "image/webp" }),
    );
    await vi.waitFor(() => expect(mocks.uploadJournalPosterObject).toHaveBeenCalledTimes(2));

    secondUpload.resolve();
    await expect(secondSave).resolves.toBeUndefined();
    firstUpload.resolve();
    await firstFailure;

    expect(mocks.row?.posterPath).toBe(secondPosterPath);
    expect(mocks.objects).toEqual(["user/entry/video.mp4", secondPosterPath]);
    for (const [paths] of mocks.bucketRemove.mock.calls) {
      expect(paths).not.toContain(secondPosterPath);
    }
  });

  it("lets delete supersede delayed completion without completion reviving the row", async () => {
    const info = deferred<{
      data: { contentType: string; size: number };
      error: null;
    }>();
    mocks.bucketInfo.mockReturnValue(info.promise);

    const completion = completeJournalUpload("user", "entry");
    await vi.waitFor(() => expect(mocks.bucketInfo).toHaveBeenCalledOnce());

    await expect(deleteJournalEntry("user", "entry")).resolves.toBe("entry");
    info.resolve({ data: { contentType: "video/mp4", size: 10 }, error: null });
    await expect(completion).rejects.toThrow(/could not be completed/);

    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "deleted",
    });
    expect(mocks.objects).toEqual([]);
  });

  it("keeps a delayed delete listing outside its claim transaction and blocks new media work", async () => {
    const listing = deferred<{
      data: Array<{ name: string }>;
      error: null;
    }>();
    mocks.bucketList.mockReturnValueOnce(listing.promise);

    const deletion = deleteJournalEntry("user", "entry");
    await vi.waitFor(() => expect(mocks.bucketList).toHaveBeenCalledOnce());

    await expect(saveJournalPoster(
      "user",
      "entry",
      new File(["poster"], "poster.webp", { type: "image/webp" }),
    )).rejects.toThrow(/already being finalized or removed/);
    expect(mocks.uploadJournalPosterObject).not.toHaveBeenCalled();

    listing.resolve({
      data: [
        { name: "video.mp4" },
        { name: oldPosterPath.slice("user/entry/".length) },
      ],
      error: null,
    });
    await expect(deletion).resolves.toBe("entry");
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "deleted",
    });
    expect(mocks.objects).toEqual([]);
  });

  it("releases a failed delete claim so cancellation can retry the same entry", async () => {
    mocks.removeFailures = 1;

    await expect(deleteJournalEntry("user", "entry"))
      .rejects.toThrow(/could not be removed.*Try again/);
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "uploading",
    });
    expect(mocks.objects).toEqual(["user/entry/video.mp4", oldPosterPath]);

    await expect(deleteJournalEntry("user", "entry")).resolves.toBe("entry");
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "deleted",
    });
    expect(mocks.objects).toEqual([]);
  });

  it("keeps a delete claim after database failure and accepts an immediate cancellation retry", async () => {
    mocks.tombstoneFailures = 1;

    await expect(deleteJournalEntry("user", "entry"))
      .rejects.toThrow(/entry cleanup must be retried/);
    expect(mocks.row).toMatchObject({
      mediaOperation: "delete",
      status: "uploading",
    });
    expect(mocks.objects).toEqual([]);

    await expect(deleteJournalEntry("user", "entry")).resolves.toBe("entry");
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "deleted",
    });
  });

  it("recovers on retry when Storage succeeded but database deletion failed", async () => {
    mocks.tombstoneFailures = 1;
    mocks.bucketInfo
      .mockResolvedValueOnce({
        data: { contentType: "video/mp4", size: 999 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Object not found", status: 404, statusCode: "404" },
      });
    mocks.missingRemovalsReturnNotFound = true;

    await expect(completeJournalUpload("user", "entry"))
      .rejects.toThrow(/upload record remains.*Retry to finish cleanup/);
    expect(mocks.row).not.toBeNull();

    await expect(completeJournalUpload("user", "entry"))
      .rejects.toThrow(/no longer available/);
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "deleted",
    });
    expect(mocks.bucketRemove).toHaveBeenCalledTimes(2);
  });

  it("does not delete a valid upload when Storage info fails transiently", async () => {
    mocks.bucketInfo.mockResolvedValue({
      data: null,
      error: { message: "Storage unavailable", status: 503, statusCode: "503" },
    });

    await expect(completeJournalUpload("user", "entry"))
      .rejects.toThrow(/could not be confirmed/);
    expect(mocks.row).toMatchObject({ mediaOperation: null, status: "uploading" });
    expect(mocks.bucketRemove).not.toHaveBeenCalled();
  });

  it("retries a valid completion after its database finalize fails", async () => {
    mocks.bucketInfo
      .mockImplementationOnce(async () => {
        mocks.updateFailures = 1;
        return {
          data: { contentType: "video/mp4", size: 10 },
          error: null,
        };
      })
      .mockResolvedValueOnce({
        data: { contentType: "video/mp4", size: 10 },
        error: null,
      });

    await expect(completeJournalUpload("user", "entry"))
      .rejects.toThrow(/could not be completed.*Try again/);
    expect(mocks.row).toMatchObject({
      mediaOperation: "complete",
      status: "uploading",
    });

    await expect(completeJournalUpload("user", "entry")).resolves.toEqual({ id: "entry" });
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "ready",
    });
    expect(mocks.objects).toEqual(["user/entry/video.mp4", oldPosterPath]);
  });

  it("recovers a losing poster cleanup failure on retry without deleting the current poster", async () => {
    const posterUpload = deferred<void>();
    mocks.posterPaths = [firstPosterPath, secondPosterPath];
    mocks.removeFailures = 1;
    mocks.uploadJournalPosterObject.mockImplementationOnce(async (
      _userId: string,
      _entryId: string,
      _file: File,
      path: string,
    ) => {
      recordStorageCall("poster upload");
      mocks.objects.push(path);
      await posterUpload.promise;
      return path;
    });

    const firstSave = saveJournalPoster(
      "user",
      "entry",
      new File(["poster"], "poster.webp", { type: "image/webp" }),
    );
    await vi.waitFor(() => expect(mocks.uploadJournalPosterObject).toHaveBeenCalledOnce());
    mocks.updateFailures = 1;
    posterUpload.resolve();
    await expect(firstSave).rejects.toThrow(/unused journal poster could not be cleaned up.*reconcile/);
    expect(mocks.row?.posterPath).toBe(oldPosterPath);
    expect(mocks.objects).toEqual([
      "user/entry/video.mp4",
      oldPosterPath,
      firstPosterPath,
    ]);
    expect(mocks.bucketRemove).toHaveBeenNthCalledWith(1, [firstPosterPath]);

    await expect(saveJournalPoster(
      "user",
      "entry",
      new File(["poster"], "poster.webp", { type: "image/webp" }),
    )).resolves.toBeUndefined();
    expect(mocks.row?.posterPath).toBe(secondPosterPath);
    expect(mocks.objects).toEqual(["user/entry/video.mp4", firstPosterPath, secondPosterPath]);
    expect(mocks.bucketRemove).toHaveBeenNthCalledWith(2, [oldPosterPath]);

    mocks.bucketInfo.mockResolvedValue({
      data: { contentType: "video/mp4", size: 10 },
      error: null,
    });
    await expect(completeJournalUpload("user", "entry")).resolves.toEqual({ id: "entry" });
    expect(mocks.objects).toEqual(["user/entry/video.mp4", secondPosterPath]);
    expect(mocks.bucketRemove).toHaveBeenNthCalledWith(3, [firstPosterPath]);
  });

  it("recovers a superseded poster cleanup failure during completion and keeps the current poster", async () => {
    mocks.removeFailures = 1;
    mocks.objects.push(otherEntryPosterPath);

    await expect(saveJournalPoster(
      "user",
      "entry",
      new File(["poster"], "poster.webp", { type: "image/webp" }),
    )).rejects.toThrow(/previous poster cleanup is pending.*reconcile/);
    expect(mocks.row?.posterPath).toBe(firstPosterPath);
    expect(mocks.objects).toEqual([
      "user/entry/video.mp4",
      oldPosterPath,
      otherEntryPosterPath,
      firstPosterPath,
    ]);
    expect(mocks.bucketRemove).toHaveBeenNthCalledWith(1, [oldPosterPath]);

    mocks.bucketInfo.mockResolvedValue({
      data: { contentType: "video/mp4", size: 10 },
      error: null,
    });
    await expect(completeJournalUpload("user", "entry")).resolves.toEqual({ id: "entry" });

    expect(mocks.row).toMatchObject({
      posterPath: firstPosterPath,
      status: "ready",
    });
    expect(mocks.objects).toEqual([
      "user/entry/video.mp4",
      otherEntryPosterPath,
      firstPosterPath,
    ]);
    expect(mocks.bucketRemove).toHaveBeenNthCalledWith(2, [oldPosterPath]);
    for (const [prefix] of mocks.bucketList.mock.calls) {
      expect(prefix).toBe("user/entry");
    }
    for (const [paths] of mocks.bucketRemove.mock.calls) {
      expect(paths).not.toContain(firstPosterPath);
    }
  });

  it("deletes discovered poster orphans only within the owned entry prefix", async () => {
    mocks.objects.push(firstPosterPath, otherEntryPosterPath);

    await expect(deleteJournalEntry("user", "entry")).resolves.toBe("entry");

    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "deleted",
    });
    expect(mocks.bucketRemove).toHaveBeenCalledWith([
      "user/entry/video.mp4",
      oldPosterPath,
      firstPosterPath,
    ]);
    expect(mocks.objects).toEqual([otherEntryPosterPath]);
    expect(mocks.bucketList).toHaveBeenCalledWith(
      "user/entry",
      expect.objectContaining({ limit: 100, offset: 0 }),
    );
  });
});

describe("cleanupAbandonedJournalUploads", () => {
  it("discovers owned poster orphans without crossing entry or user prefixes", async () => {
    mocks.objects.push(firstPosterPath, otherEntryPosterPath, otherUserPosterPath);

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 1, failed: 0 });

    expect(mocks.row).toBeNull();
    expect(mocks.bucketList).toHaveBeenCalledWith(
      "user/entry",
      expect.objectContaining({ limit: 100, offset: 0 }),
    );
    expect(mocks.bucketRemove).toHaveBeenCalledWith([
      "user/entry/video.mp4",
      oldPosterPath,
      firstPosterPath,
    ]);
    expect(mocks.objects).toEqual([otherEntryPosterPath, otherUserPosterPath]);
  });

  it.each(["listing", "removal"] as const)(
    "preserves the upload row when Storage %s fails",
    async (failure) => {
      mocks.objects.push(firstPosterPath);
      if (failure === "listing") {
        mocks.bucketList.mockResolvedValue({
          data: null,
          error: { message: "Storage unavailable", status: 503, statusCode: "503" },
        });
      } else {
        mocks.removeFailures = 1;
      }

      await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
        .resolves.toEqual({ removed: 0, failed: 1 });

      expect(mocks.row).toMatchObject({
        id: "entry",
        mediaOperation: "cleanup",
        status: "uploading",
      });
    },
  );

  it("retries a retained cleanup claim after a transient Storage failure", async () => {
    mocks.removeFailures = 1;

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 0, failed: 1 });
    expect(mocks.row).toMatchObject({ mediaOperation: "cleanup" });

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:01:00Z")))
      .resolves.toEqual({ removed: 1, failed: 0 });
    expect(mocks.row).toBeNull();
    expect(mocks.objects).toEqual([]);
  });

  it("retries successfully after Storage cleanup succeeds but database deletion fails", async () => {
    mocks.objects.push(firstPosterPath);
    mocks.deleteFailures = 1;

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 0, failed: 1 });
    expect(mocks.row).toMatchObject({ id: "entry", status: "uploading" });
    expect(mocks.objects).toEqual([]);

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:01:00Z")))
      .resolves.toEqual({ removed: 1, failed: 0 });
    expect(mocks.row).toBeNull();
    expect(mocks.bucketRemove).toHaveBeenCalledTimes(2);
  });

  it("preserves an entry that becomes ready after the initial abandoned scan", async () => {
    mocks.afterAbandonedScan = () => {
      if (mocks.row) mocks.row = { ...mocks.row, status: "ready" };
    };

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 0, failed: 0 });

    expect(mocks.row).toMatchObject({ id: "entry", status: "ready" });
    expect(mocks.bucketList).not.toHaveBeenCalled();
    expect(mocks.bucketRemove).not.toHaveBeenCalled();
    expect(mocks.objects).toEqual(["user/entry/video.mp4", oldPosterPath]);
  });

  it("does not preempt a fresh poster claim on an old upload", async () => {
    mocks.row = {
      ...uploadRow(),
      mediaOperation: "poster",
      mediaOperationToken: "11111111-1111-4111-8111-111111111111",
      mediaOperationStartedAt: new Date("2026-07-23T11:59:00Z"),
    };

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 0, failed: 0 });

    expect(mocks.row).toMatchObject({ mediaOperation: "poster", status: "uploading" });
    expect(mocks.bucketList).not.toHaveBeenCalled();
    expect(mocks.bucketRemove).not.toHaveBeenCalled();
  });

  it("does not preempt a fresh delete claim", async () => {
    mocks.row = {
      ...uploadRow(),
      status: "ready",
      mediaOperation: "delete",
      mediaOperationToken: "11111111-1111-4111-8111-111111111111",
      mediaOperationStartedAt: new Date("2026-07-23T11:59:00Z"),
    };

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 0, failed: 0 });

    expect(mocks.row).toMatchObject({ mediaOperation: "delete", status: "ready" });
    expect(mocks.bucketList).not.toHaveBeenCalled();
    expect(mocks.bucketRemove).not.toHaveBeenCalled();
  });

  it("takes over an expired delete claim on a ready entry", async () => {
    mocks.row = {
      ...uploadRow(),
      status: "ready",
      mediaOperation: "delete",
      mediaOperationToken: "11111111-1111-4111-8111-111111111111",
      mediaOperationStartedAt: new Date("2026-07-23T11:50:00Z"),
    };

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 0, failed: 0 });

    expect(mocks.row).toMatchObject({
      deletedAt: new Date("2026-07-23T12:00:00Z"),
      mediaOperation: null,
      status: "deleted",
    });
    expect(mocks.objects).toEqual([]);
  });

  it("takes over a delete claim exactly at the lease boundary", async () => {
    mocks.row = {
      ...uploadRow(),
      status: "ready",
      mediaOperation: "delete",
      mediaOperationToken: "11111111-1111-4111-8111-111111111111",
      mediaOperationStartedAt: new Date("2026-07-23T11:55:00Z"),
    };

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 0, failed: 0 });

    expect(mocks.row).toMatchObject({
      deletedAt: new Date("2026-07-23T12:00:00Z"),
      mediaOperation: null,
      status: "deleted",
    });
    expect(mocks.objects).toEqual([]);
  });

  it("retries an expired delete after Storage fails and retains its tombstone", async () => {
    mocks.row = {
      ...uploadRow(),
      status: "ready",
      mediaOperation: "delete",
      mediaOperationToken: "11111111-1111-4111-8111-111111111111",
      mediaOperationStartedAt: new Date("2026-07-23T11:50:00Z"),
    };
    mocks.removeFailures = 1;

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 0, failed: 1 });
    expect(mocks.row).toMatchObject({
      mediaOperation: "cleanup",
      status: "deleted",
    });
    expect(mocks.objects).toEqual(["user/entry/video.mp4", oldPosterPath]);

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:01:00Z")))
      .resolves.toEqual({ removed: 0, failed: 0 });
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "deleted",
    });
    expect(mocks.objects).toEqual([]);

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T15:00:00Z")))
      .resolves.toEqual({ removed: 1, failed: 0 });
    expect(mocks.row).toBeNull();
  });

  it("removes uploads arriving after visible deletion only after token expiry", async () => {
    mocks.objects.push(otherEntryPosterPath);

    await expect(deleteJournalEntry("user", "entry")).resolves.toBe("entry");
    const deletedAt = mocks.row?.deletedAt;
    expect(deletedAt).toBeInstanceOf(Date);
    expect(mocks.row).toMatchObject({
      mediaOperation: null,
      status: "deleted",
    });

    mocks.objects.push("user/entry/video.mp4", firstPosterPath);
    mocks.bucketList.mockClear();
    mocks.bucketRemove.mockClear();

    const beforeExpiry = new Date(deletedAt!.getTime() + (3 * 60 * 60 * 1000) - 1);
    await expect(cleanupAbandonedJournalUploads(beforeExpiry))
      .resolves.toEqual({ removed: 0, failed: 0 });
    expect(mocks.row).toMatchObject({ status: "deleted" });
    expect(mocks.bucketList).not.toHaveBeenCalled();
    expect(mocks.bucketRemove).not.toHaveBeenCalled();

    const atExpiry = new Date(deletedAt!.getTime() + (3 * 60 * 60 * 1000));
    await expect(cleanupAbandonedJournalUploads(atExpiry))
      .resolves.toEqual({ removed: 1, failed: 0 });
    expect(mocks.row).toBeNull();
    expect(mocks.bucketRemove).toHaveBeenCalledWith([
      "user/entry/video.mp4",
      oldPosterPath,
      firstPosterPath,
    ]);
    expect(mocks.objects).toEqual([otherEntryPosterPath]);
  });

  it("takes over a stale media claim and finishes abandoned cleanup", async () => {
    mocks.row = {
      ...uploadRow(),
      mediaOperation: "complete",
      mediaOperationToken: "11111111-1111-4111-8111-111111111111",
      mediaOperationStartedAt: new Date("2026-07-23T11:50:00Z"),
    };

    await expect(cleanupAbandonedJournalUploads(new Date("2026-07-23T12:00:00Z")))
      .resolves.toEqual({ removed: 1, failed: 0 });

    expect(mocks.row).toBeNull();
    expect(mocks.objects).toEqual([]);
  });
});

function installSerializedTransactions(): void {
  let tail = Promise.resolve();
  mocks.transaction.mockReset().mockImplementation(async (
    callback: (tx: ReturnType<typeof fakeTransaction>) => Promise<unknown>,
  ) => {
    let release: () => void = () => {};
    const previous = tail;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const local = { row: mocks.row ? { ...mocks.row } : null };
    try {
      mocks.activeTransactions += 1;
      const result = await callback(fakeTransaction(local));
      mocks.row = local.row;
      return result;
    } finally {
      mocks.activeTransactions -= 1;
      release();
    }
  });
}

function fakeTransaction(local: { row: UploadRow | null }) {
  return {
    delete: vi.fn(() => {
      const builder = chainBuilder();
      builder.returning = vi.fn(async () => {
        if (mocks.deleteFailures > 0) {
          mocks.deleteFailures -= 1;
          throw new Error("database unavailable");
        }
        if (!local.row) return [];
        const id = local.row.id;
        local.row = null;
        return [{ id }];
      });
      return builder;
    }),
    select: vi.fn(() => {
      const builder = chainBuilder();
      builder.for = vi.fn(() => {
        mocks.forUpdate();
        return builder;
      });
      builder.limit = vi.fn(async () => local.row ? [{ ...local.row }] : []);
      return builder;
    }),
    update: vi.fn(() => {
      let values: Partial<UploadRow> = {};
      const builder = chainBuilder();
      builder.set = vi.fn((nextValues: Partial<UploadRow>) => {
        values = nextValues;
        return builder;
      });
      builder.returning = vi.fn(async () => {
        if (values.status === "deleted" && mocks.tombstoneFailures > 0) {
          mocks.tombstoneFailures -= 1;
          throw new Error("database unavailable");
        }
        if (mocks.updateFailures > 0) {
          mocks.updateFailures -= 1;
          throw new Error("database unavailable");
        }
        if (!local.row) return [];
        local.row = { ...local.row, ...values };
        return [{ id: local.row.id }];
      });
      return builder;
    }),
  };
}

function chainBuilder(): Record<string, ReturnType<typeof vi.fn>> {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["from", "innerJoin", "where", "for", "limit", "set", "returning"]) {
    builder[method] = vi.fn(() => builder);
  }
  return builder;
}

function uploadRow(): UploadRow {
  return {
    createdAt: new Date("2026-07-22T00:00:00Z"),
    deletedAt: null,
    id: "entry",
    mediaOperation: null,
    mediaOperationStartedAt: null,
    mediaOperationToken: null,
    mediaId: "media",
    mimeType: "video/mp4",
    posterPath: oldPosterPath,
    sizeBytes: 10,
    status: "uploading",
    storagePath: "user/entry/video.mp4",
    userId: "user",
  };
}

function recordStorageCall(operation: string): void {
  if (mocks.activeTransactions > 0) {
    mocks.storageCallsInsideTransactions.push(operation);
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
