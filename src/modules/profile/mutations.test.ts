import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAppUser } from "@/modules/auth";
import type { PreparedAvatarUpload } from "./avatar";

type ProfileRow = {
  id: string;
  displayName: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  location: string | null;
  avatarUrl: string | null;
};

const mocks = vi.hoisted(() => ({
  activeTransactions: 0,
  commitOutcomeFailures: 0,
  forUpdate: vi.fn(),
  listProfileAvatarPaths: vi.fn(),
  maxActiveTransactions: 0,
  prepareProfileAvatarUpload: vi.fn(),
  preparedUploads: [] as PreparedAvatarUpload[],
  removeFailures: new Map<string, number>(),
  removeUploadedAvatar: vi.fn(),
  row: null as ProfileRow | null,
  select: vi.fn(),
  storageCallsDuringTransaction: [] as string[],
  storageObjects: new Set<string>(),
  transaction: vi.fn(),
  uploadPreparedProfileAvatar: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

vi.mock("./avatar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./avatar")>();
  return {
    ...actual,
    listProfileAvatarPaths: mocks.listProfileAvatarPaths,
    prepareProfileAvatarUpload: mocks.prepareProfileAvatarUpload,
    removeUploadedAvatar: mocks.removeUploadedAvatar,
    uploadPreparedProfileAvatar: mocks.uploadPreparedProfileAvatar,
  };
});

import { updateProfile } from "./mutations";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const originalPath = `${userId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
const firstPath = `${userId}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`;
const secondPath = `${userId}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`;
const orphanPath = `${userId}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg`;
const otherUserPath = `${otherUserId}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.jpg`;

beforeEach(() => {
  mocks.activeTransactions = 0;
  mocks.commitOutcomeFailures = 0;
  mocks.forUpdate.mockReset();
  mocks.maxActiveTransactions = 0;
  mocks.preparedUploads = [preparedAvatar(firstPath), preparedAvatar(secondPath)];
  mocks.removeFailures.clear();
  mocks.row = profileRow(avatarUrl(originalPath));
  mocks.storageCallsDuringTransaction = [];
  mocks.storageObjects = new Set([originalPath, otherUserPath]);

  mocks.prepareProfileAvatarUpload.mockReset().mockImplementation(async () => (
    mocks.preparedUploads.shift() ?? preparedAvatar(firstPath)
  ));
  mocks.uploadPreparedProfileAvatar.mockReset().mockImplementation(
    async (upload: PreparedAvatarUpload) => {
      recordStorageCall("upload");
      mocks.storageObjects.add(upload.path);
    },
  );
  mocks.removeUploadedAvatar.mockReset().mockImplementation(async (path: string) => {
    recordStorageCall("remove");
    const failures = mocks.removeFailures.get(path) ?? 0;
    if (failures > 0) {
      mocks.removeFailures.set(path, failures - 1);
      throw new Error("storage unavailable");
    }
    mocks.storageObjects.delete(path);
  });
  mocks.listProfileAvatarPaths.mockReset().mockImplementation(async (requestedUserId: string) => {
    recordStorageCall("list");
    return [...mocks.storageObjects].filter((path) => (
      path.startsWith(`${requestedUserId}/`)
      && !path.slice(requestedUserId.length + 1).includes("/")
    ));
  });

  installDirectSelect();
  installSerializedTransactions();
});

describe("updateProfile avatar claims and reconciliation", () => {
  it("lets a newer upload claim and finalize while an earlier upload is delayed", async () => {
    const firstUpload = deferred<void>();
    mocks.uploadPreparedProfileAvatar
      .mockImplementationOnce(async (upload: PreparedAvatarUpload) => {
        recordStorageCall("upload");
        await firstUpload.promise;
        mocks.storageObjects.add(upload.path);
      })
      .mockImplementationOnce(async (upload: PreparedAvatarUpload) => {
        recordStorageCall("upload");
        mocks.storageObjects.add(upload.path);
      });

    const firstUpdate = updateProfile(currentUser(), input({
      username: "first_save",
      avatar: imageFile("first.jpg"),
    }));
    await vi.waitFor(() => expect(mocks.uploadPreparedProfileAvatar).toHaveBeenCalledOnce());
    expect(mocks.row?.avatarUrl).toContain("#profile-avatar-claim=");

    const secondUpdate = updateProfile(currentUser(), input({
      username: "second_save",
      avatar: imageFile("second.jpg"),
    }));
    await expect(secondUpdate).resolves.toMatchObject({
      username: "second_save",
      avatarUrl: avatarUrl(secondPath),
    });
    expect(mocks.row?.avatarUrl).toBe(avatarUrl(secondPath));

    firstUpload.resolve();
    await expect(firstUpdate).rejects.toMatchObject({ status: 409 });

    expect(mocks.storageObjects).toEqual(new Set([secondPath, otherUserPath]));
    expect(removedPaths()).toContain(originalPath);
    expect(removedPaths()).toContain(firstPath);
    expect(removedPaths()).not.toContain(secondPath);
    expect(mocks.storageCallsDuringTransaction).toEqual([]);
  });

  it("lets removal supersede a delayed upload without waiting for Storage", async () => {
    const upload = deferred<void>();
    mocks.uploadPreparedProfileAvatar.mockImplementationOnce(
      async (prepared: PreparedAvatarUpload) => {
        recordStorageCall("upload");
        await upload.promise;
        mocks.storageObjects.add(prepared.path);
      },
    );

    const uploadUpdate = updateProfile(currentUser(), input({
      username: "upload_save",
      avatar: imageFile("upload.jpg"),
    }));
    await vi.waitFor(() => expect(mocks.uploadPreparedProfileAvatar).toHaveBeenCalledOnce());

    await expect(updateProfile(currentUser(), input({
      username: "remove_save",
      removeAvatar: true,
    }))).resolves.toMatchObject({ username: "remove_save", avatarUrl: null });
    expect(mocks.row?.avatarUrl).toBeNull();

    upload.resolve();
    await expect(uploadUpdate).rejects.toMatchObject({ status: 409 });
    expect(mocks.storageObjects).toEqual(new Set([otherUserPath]));
    expect(mocks.storageCallsDuringTransaction).toEqual([]);
  });

  it("allows another profile transaction to finish while superseded removal is delayed", async () => {
    const removal = deferred<void>();
    mocks.removeUploadedAvatar.mockImplementationOnce(async (path: string) => {
      recordStorageCall("remove");
      await removal.promise;
      mocks.storageObjects.delete(path);
    });

    const avatarUpdate = updateProfile(currentUser(), input({
      username: "avatar_save",
      avatar: imageFile("replacement.jpg"),
    }));
    await vi.waitFor(() => expect(mocks.removeUploadedAvatar).toHaveBeenCalledWith(originalPath));

    await expect(updateProfile(currentUser(), input({
      username: "details_save",
    }))).resolves.toMatchObject({
      username: "details_save",
      avatarUrl: avatarUrl(firstPath),
    });
    expect(mocks.row?.username).toBe("details_save");

    removal.resolve();
    await expect(avatarUpdate).resolves.toMatchObject({ avatarUrl: avatarUrl(firstPath) });
    expect(mocks.storageCallsDuringTransaction).toEqual([]);
  });

  it("protects both sides of an in-flight claim during a concurrent reconciliation", async () => {
    const upload = deferred<void>();
    mocks.storageObjects.add(firstPath).add(orphanPath);
    mocks.uploadPreparedProfileAvatar.mockImplementationOnce(async () => {
      recordStorageCall("upload");
      await upload.promise;
    });

    const avatarUpdate = updateProfile(currentUser(), input({
      avatar: imageFile("replacement.jpg"),
    }));
    await vi.waitFor(() => expect(mocks.uploadPreparedProfileAvatar).toHaveBeenCalledOnce());

    await expect(updateProfile(currentUser(), input({
      username: "details_save",
    }))).resolves.toMatchObject({ username: "details_save" });
    expect(mocks.storageObjects).toContain(originalPath);
    expect(mocks.storageObjects).toContain(firstPath);
    expect(mocks.storageObjects).not.toContain(orphanPath);
    expect(removedPaths()).toEqual([orphanPath]);

    upload.resolve();
    await expect(avatarUpdate).resolves.toMatchObject({ avatarUrl: avatarUrl(firstPath) });
    expect(mocks.storageObjects).toEqual(new Set([firstPath, otherUserPath]));
    expect(mocks.storageCallsDuringTransaction).toEqual([]);
  });

  it("recovers a seeded expired claim during a non-avatar update", async () => {
    if (mocks.row) {
      mocks.row.avatarUrl = seededAvatarClaim(
        avatarUrl(originalPath),
        avatarUrl(firstPath),
        0,
      );
    }
    mocks.storageObjects.add(firstPath);

    await expect(updateProfile(currentUser(), input({
      username: "details_save",
    }))).resolves.toMatchObject({
      username: "details_save",
      avatarUrl: avatarUrl(originalPath),
    });

    expect(mocks.row?.avatarUrl).toBe(avatarUrl(originalPath));
    expect(mocks.storageObjects).toEqual(new Set([originalPath, otherUserPath]));
    expect(removedPaths()).toEqual([firstPath]);
    expect(removedPaths()).not.toContain(originalPath);
    expect(removedPaths()).not.toContain(otherUserPath);
    expect(mocks.prepareProfileAvatarUpload).not.toHaveBeenCalled();
    expect(mocks.storageCallsDuringTransaction).toEqual([]);
  });

  it("retries an expired claim cleanup failure on a later profile update", async () => {
    if (mocks.row) {
      mocks.row.avatarUrl = seededAvatarClaim(
        avatarUrl(originalPath),
        avatarUrl(firstPath),
        0,
      );
    }
    mocks.storageObjects.add(firstPath);
    mocks.removeFailures.set(firstPath, 2);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await updateProfile(currentUser(), input({ username: "first_retry" }));
    expect(mocks.row?.avatarUrl).toBe(avatarUrl(originalPath));
    expect(mocks.storageObjects).toContain(firstPath);
    expect(removedPaths().filter((path) => path === firstPath)).toHaveLength(2);

    await updateProfile(currentUser(), input({ username: "second_retry" }));
    expect(mocks.row?.avatarUrl).toBe(avatarUrl(originalPath));
    expect(mocks.storageObjects).toEqual(new Set([originalPath, otherUserPath]));
    expect(removedPaths().filter((path) => path === firstPath)).toHaveLength(3);
    expect(consoleError).toHaveBeenCalledWith(
      "Abandoned profile avatar cleanup failed.",
      "storage unavailable",
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Profile avatar reconciliation failed.",
      "storage unavailable",
    );
    consoleError.mockRestore();
  });

  it("rediscovers a superseded avatar after repeated cleanup failure and retries later", async () => {
    mocks.removeFailures.set(originalPath, 2);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(updateProfile(currentUser(), input({
      avatar: imageFile("replacement.jpg"),
    }))).resolves.toMatchObject({ avatarUrl: avatarUrl(firstPath) });
    expect(mocks.storageObjects).toEqual(new Set([originalPath, firstPath, otherUserPath]));
    expect(removedPaths().filter((path) => path === originalPath)).toHaveLength(2);

    await expect(updateProfile(currentUser(), input({
      username: "later_save",
    }))).resolves.toMatchObject({ username: "later_save" });
    expect(mocks.storageObjects).toEqual(new Set([firstPath, otherUserPath]));
    expect(removedPaths().filter((path) => path === originalPath)).toHaveLength(3);
    expect(consoleError).toHaveBeenCalledWith("Profile avatar cleanup failed.", "storage unavailable");
    expect(consoleError).toHaveBeenCalledWith(
      "Profile avatar reconciliation failed.",
      "storage unavailable",
    );
    consoleError.mockRestore();
  });

  it("removes public orphans while protecting the committed avatar and another user", async () => {
    mocks.storageObjects.add(orphanPath);

    await updateProfile(currentUser(), input({ username: "reconcile_save" }));

    expect(mocks.storageObjects).toEqual(new Set([originalPath, otherUserPath]));
    expect(removedPaths()).toEqual([orphanPath]);
    expect(removedPaths()).not.toContain(originalPath);
    expect(removedPaths()).not.toContain(otherUserPath);
    expect(mocks.listProfileAvatarPaths).toHaveBeenCalledWith(userId);
    expect(mocks.listProfileAvatarPaths).not.toHaveBeenCalledWith(otherUserId);
  });

  it("rolls back a failed upload and deletes its object outside the transaction", async () => {
    mocks.uploadPreparedProfileAvatar.mockImplementationOnce(
      async (upload: PreparedAvatarUpload) => {
        recordStorageCall("upload");
        mocks.storageObjects.add(upload.path);
        throw new Error("upload response unavailable");
      },
    );

    await expect(updateProfile(currentUser(), input({
      avatar: imageFile("replacement.jpg"),
    }))).rejects.toThrow("upload response unavailable");

    expect(mocks.row?.avatarUrl).toBe(avatarUrl(originalPath));
    expect(mocks.storageObjects).toEqual(new Set([originalPath, otherUserPath]));
    expect(removedPaths()).toEqual([firstPath]);
    expect(mocks.storageCallsDuringTransaction).toEqual([]);
  });

  it("continues an upload when an uncertain claim commit is confirmed by reread", async () => {
    mocks.commitOutcomeFailures = 1;

    await expect(updateProfile(currentUser(), input({
      avatar: imageFile("replacement.jpg"),
    }))).resolves.toMatchObject({ avatarUrl: avatarUrl(firstPath) });

    expect(mocks.row?.avatarUrl).toBe(avatarUrl(firstPath));
    expect(mocks.storageObjects).toEqual(new Set([firstPath, otherUserPath]));
    expect(mocks.uploadPreparedProfileAvatar).toHaveBeenCalledOnce();
    expect(mocks.storageCallsDuringTransaction).toEqual([]);
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
    mocks.activeTransactions += 1;
    mocks.maxActiveTransactions = Math.max(
      mocks.maxActiveTransactions,
      mocks.activeTransactions,
    );
    try {
      const result = await callback(fakeTransaction(local));
      mocks.row = local.row;
      if (mocks.commitOutcomeFailures > 0) {
        mocks.commitOutcomeFailures -= 1;
        throw new Error("database commit outcome unavailable");
      }
      return result;
    } finally {
      mocks.activeTransactions -= 1;
      release();
    }
  });
}

function installDirectSelect(): void {
  mocks.select.mockReset().mockImplementation(() => {
    const builder = chainBuilder();
    builder.limit = vi.fn(async () => mocks.row
      ? [{ avatarUrl: mocks.row.avatarUrl }]
      : []);
    return builder;
  });
}

function fakeTransaction(local: { row: ProfileRow | null }) {
  return {
    select: vi.fn(() => {
      const builder = chainBuilder();
      builder.for = vi.fn(() => {
        mocks.forUpdate();
        return builder;
      });
      builder.limit = vi.fn(async () => local.row
        ? [{ avatarUrl: local.row.avatarUrl }]
        : []);
      return builder;
    }),
    update: vi.fn(() => {
      let values: Partial<ProfileRow> = {};
      const builder = chainBuilder();
      builder.set = vi.fn((nextValues: Partial<ProfileRow>) => {
        values = nextValues;
        return builder;
      });
      builder.returning = vi.fn(async () => {
        if (!local.row) return [];
        local.row = { ...local.row, ...values };
        return [{ ...local.row }];
      });
      return builder;
    }),
  };
}

function chainBuilder(): Record<string, ReturnType<typeof vi.fn>> {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["from", "where", "for", "limit", "set", "returning"]) {
    builder[method] = vi.fn(() => builder);
  }
  return builder;
}

function recordStorageCall(operation: string): void {
  if (mocks.activeTransactions > 0) {
    mocks.storageCallsDuringTransaction.push(operation);
  }
}

function currentUser(): CurrentAppUser {
  return {
    ...profileRow(avatarUrl(originalPath)),
    email: "fighter@example.com",
    profileOnboardedAt: new Date("2026-01-01T00:00:00Z"),
    firstDrillGuideCompletedAt: new Date("2026-01-02T00:00:00Z"),
    firstDrillGuideSkippedAt: null,
  };
}

function profileRow(avatarUrlValue: string | null): ProfileRow {
  return {
    id: userId,
    displayName: "fighter",
    username: "fighter",
    firstName: "Test",
    lastName: "Fighter",
    location: "Vancouver",
    avatarUrl: avatarUrlValue,
  };
}

function input(overrides: Partial<Parameters<typeof updateProfile>[1]> = {}) {
  return {
    username: "fighter",
    firstName: "Test",
    lastName: "Fighter",
    location: "Vancouver",
    avatar: null,
    removeAvatar: false,
    ...overrides,
  };
}

function imageFile(name: string): File {
  return new File(["image"], name, { type: "image/jpeg" });
}

function preparedAvatar(path: string): PreparedAvatarUpload {
  return {
    path,
    publicUrl: avatarUrl(path),
    bytes: new Uint8Array([1, 2, 3]),
    mime: "image/jpeg",
  };
}

function avatarUrl(path: string): string {
  return `https://project.supabase.co/storage/v1/object/public/profile-avatars/${path}`;
}

function seededAvatarClaim(
  previousAvatarUrl: string | null,
  targetAvatarUrl: string,
  expiresAt: number,
): string {
  const payload = encodeURIComponent(JSON.stringify({
    expiresAt,
    previousAvatarUrl,
    targetAvatarUrl,
  }));
  const baseUrl = previousAvatarUrl ?? targetAvatarUrl;
  return `${baseUrl}#profile-avatar-claim=${payload}`;
}

function removedPaths(): string[] {
  return mocks.removeUploadedAvatar.mock.calls.map(([path]) => path as string);
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
