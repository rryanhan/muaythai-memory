import { beforeEach, describe, expect, it, vi } from "vitest";

type UploadRow = {
  id: string;
  mediaId: string;
  mimeType: string;
  posterPath: string | null;
  sizeBytes: number;
  status: string;
  storagePath: string;
};

const mocks = vi.hoisted(() => ({
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
  transaction: vi.fn(),
  updateFailures: 0,
  uploadJournalPosterObject: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
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

import { completeJournalUpload, deleteJournalEntry, saveJournalPoster } from "./mutations";

const oldPosterPath = "user/entry/poster-11111111-1111-4111-8111-111111111111.webp";
const firstPosterPath = "user/entry/poster-22222222-2222-4222-8222-222222222222.webp";
const secondPosterPath = "user/entry/poster-33333333-3333-4333-8333-333333333333.webp";
const otherEntryPosterPath = "user/other-entry/poster-44444444-4444-4444-8444-444444444444.webp";

beforeEach(() => {
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
        info: mocks.bucketInfo,
        list: mocks.bucketList,
        remove: mocks.bucketRemove,
      }),
    },
  });
  mocks.deleteFailures = 0;
  mocks.forUpdate.mockReset();
  mocks.getJournalEntryById.mockReset().mockResolvedValue({ id: "entry" });
  mocks.getOwnedJournalRow.mockReset().mockImplementation(
    async () => mocks.row ? { ...mocks.row } : null,
  );
  mocks.missingRemovalsReturnNotFound = false;
  mocks.objects = ["user/entry/video.mp4", oldPosterPath];
  mocks.posterPaths = [firstPosterPath];
  mocks.removeFailures = 0;
  mocks.row = uploadRow();
  mocks.updateFailures = 0;
  mocks.uploadJournalPosterObject.mockReset().mockImplementation(async (
    _userId: string,
    _entryId: string,
    _file: File,
    path: string,
  ) => {
    mocks.objects.push(path);
    return path;
  });
  installSerializedTransactions();
});

describe("journal upload mutation locking", () => {
  it("serializes completion before poster upload so a losing object is never created", async () => {
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
    await vi.waitFor(() => expect(mocks.forUpdate).toHaveBeenCalledOnce());
    expect(mocks.uploadJournalPosterObject).not.toHaveBeenCalled();

    info.resolve({ data: { contentType: "video/mp4", size: 10 }, error: null });

    await expect(completion).resolves.toEqual({ id: "entry" });
    await expect(posterSave).rejects.toThrow(/only be added while the video is uploading/);
    expect(mocks.row).toMatchObject({
      posterPath: oldPosterPath,
      status: "ready",
    });
    expect(mocks.bucketRemove).not.toHaveBeenCalled();
    expect(mocks.objects).toContain(oldPosterPath);
    expect(mocks.forUpdate).toHaveBeenCalledTimes(2);
  });

  it("recovers on retry when Storage succeeded but database deletion failed", async () => {
    mocks.deleteFailures = 1;
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
    expect(mocks.row).toBeNull();
    expect(mocks.bucketRemove).toHaveBeenCalledTimes(2);
  });

  it("does not delete a valid upload when Storage info fails transiently", async () => {
    mocks.bucketInfo.mockResolvedValue({
      data: null,
      error: { message: "Storage unavailable", status: 503, statusCode: "503" },
    });

    await expect(completeJournalUpload("user", "entry"))
      .rejects.toThrow(/could not be confirmed/);
    expect(mocks.row).toMatchObject({ status: "uploading" });
    expect(mocks.bucketRemove).not.toHaveBeenCalled();
  });

  it("recovers a losing poster cleanup failure on retry without deleting the current poster", async () => {
    mocks.posterPaths = [firstPosterPath, secondPosterPath];
    mocks.removeFailures = 1;
    mocks.updateFailures = 1;

    await expect(saveJournalPoster(
      "user",
      "entry",
      new File(["poster"], "poster.webp", { type: "image/webp" }),
    )).rejects.toThrow(/unused journal poster could not be cleaned up.*reconcile/);
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
    expect(mocks.objects).toEqual(["user/entry/video.mp4", secondPosterPath]);
    expect(mocks.bucketRemove).toHaveBeenNthCalledWith(2, [firstPosterPath]);
    expect(mocks.bucketRemove).toHaveBeenNthCalledWith(3, [oldPosterPath]);
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

    expect(mocks.row).toBeNull();
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
      const result = await callback(fakeTransaction(local));
      mocks.row = local.row;
      return result;
    } finally {
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
    id: "entry",
    mediaId: "media",
    mimeType: "video/mp4",
    posterPath: oldPosterPath,
    sizeBytes: 10,
    status: "uploading",
    storagePath: "user/entry/video.mp4",
  };
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
