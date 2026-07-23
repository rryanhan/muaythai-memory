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
  bucketRemove: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  deleteFailures: 0,
  forUpdate: vi.fn(),
  getJournalEntryById: vi.fn(),
  getOwnedJournalRow: vi.fn(),
  row: null as UploadRow | null,
  transaction: vi.fn(),
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
  uploadJournalPosterObject: mocks.uploadJournalPosterObject,
}));

vi.mock("./queries", () => ({
  getJournalEntryById: mocks.getJournalEntryById,
  getOwnedJournalRow: mocks.getOwnedJournalRow,
}));

import { completeJournalUpload, saveJournalPoster } from "./mutations";

beforeEach(() => {
  mocks.bucketInfo.mockReset();
  mocks.bucketRemove.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.createSupabaseAdminClient.mockReset().mockReturnValue({
    storage: {
      from: () => ({
        info: mocks.bucketInfo,
        remove: mocks.bucketRemove,
      }),
    },
  });
  mocks.deleteFailures = 0;
  mocks.forUpdate.mockReset();
  mocks.getJournalEntryById.mockReset().mockResolvedValue({ id: "entry" });
  mocks.getOwnedJournalRow.mockReset();
  mocks.row = uploadRow();
  mocks.uploadJournalPosterObject.mockReset().mockResolvedValue("user/entry/poster-new.webp");
  installSerializedTransactions();
});

describe("journal upload mutation locking", () => {
  it("serializes completion against a poster replacement and cleans the losing poster", async () => {
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
    await vi.waitFor(() => expect(mocks.uploadJournalPosterObject).toHaveBeenCalledOnce());

    info.resolve({ data: { contentType: "video/mp4", size: 10 }, error: null });

    await expect(completion).resolves.toEqual({ id: "entry" });
    await expect(posterSave).rejects.toThrow(/only be added while the video is uploading/);
    expect(mocks.row).toMatchObject({
      posterPath: "user/entry/poster-old.webp",
      status: "ready",
    });
    expect(mocks.bucketRemove).toHaveBeenCalledWith(["user/entry/poster-new.webp"]);
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
    mocks.bucketRemove
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Object not found", status: 404, statusCode: "404" },
      });

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

  it("surfaces a resolved Storage error while cleaning a poster that lost the lock", async () => {
    mocks.row = { ...uploadRow(), status: "ready" };
    mocks.bucketRemove.mockResolvedValue({
      data: null,
      error: { message: "Storage unavailable", status: 503, statusCode: "503" },
    });

    await expect(saveJournalPoster(
      "user",
      "entry",
      new File(["poster"], "poster.webp", { type: "image/webp" }),
    )).rejects.toThrow(/unused journal poster could not be cleaned up/);
    expect(mocks.bucketRemove).toHaveBeenCalledWith(["user/entry/poster-new.webp"]);
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
    posterPath: "user/entry/poster-old.webp",
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
