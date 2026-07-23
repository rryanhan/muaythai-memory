import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAppUser } from "@/modules/auth";
import type { UploadedAvatar } from "./avatar";

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
  commitOutcomeFailures: 0,
  forUpdate: vi.fn(),
  removeFailures: new Set<string>(),
  removeUploadedAvatar: vi.fn(),
  row: null as ProfileRow | null,
  storageObjects: new Set<string>(),
  transaction: vi.fn(),
  updateFailures: 0,
  uploadProfileAvatar: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

vi.mock("./avatar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./avatar")>();
  return {
    ...actual,
    removeUploadedAvatar: mocks.removeUploadedAvatar,
    uploadProfileAvatar: mocks.uploadProfileAvatar,
  };
});

import { updateProfile } from "./mutations";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const originalPath = `${userId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
const firstPath = `${userId}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`;
const secondPath = `${userId}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`;
const otherUserPath = `${otherUserId}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg`;

beforeEach(() => {
  mocks.commitOutcomeFailures = 0;
  mocks.forUpdate.mockReset();
  mocks.removeFailures.clear();
  mocks.removeUploadedAvatar.mockReset().mockImplementation(async (path: string) => {
    if (mocks.removeFailures.has(path)) throw new Error("storage unavailable");
    mocks.storageObjects.delete(path);
  });
  mocks.row = profileRow(avatarUrl(originalPath));
  mocks.storageObjects = new Set([originalPath, otherUserPath]);
  mocks.updateFailures = 0;
  mocks.uploadProfileAvatar.mockReset();
  installSerializedTransactions();
});

describe("updateProfile avatar serialization", () => {
  it("serializes overlapping uploads and never removes the committed avatar", async () => {
    const firstUpload = deferred<UploadedAvatar>();
    mocks.uploadProfileAvatar
      .mockImplementationOnce(async () => {
        const uploaded = await firstUpload.promise;
        mocks.storageObjects.add(uploaded.path);
        return uploaded;
      })
      .mockImplementationOnce(async () => {
        const uploaded = uploadedAvatar(secondPath);
        mocks.storageObjects.add(uploaded.path);
        return uploaded;
      });

    const firstUpdate = updateProfile(currentUser(), input({
      username: "first_save",
      avatar: imageFile("first.jpg"),
    }));
    await vi.waitFor(() => expect(mocks.uploadProfileAvatar).toHaveBeenCalledOnce());

    const secondUpdate = updateProfile(currentUser(), input({
      username: "second_save",
      avatar: imageFile("second.jpg"),
    }));
    await vi.waitFor(() => expect(mocks.transaction).toHaveBeenCalledTimes(2));
    expect(mocks.uploadProfileAvatar).toHaveBeenCalledOnce();

    firstUpload.resolve(uploadedAvatar(firstPath));

    await expect(firstUpdate).resolves.toMatchObject({ avatarUrl: avatarUrl(firstPath) });
    await expect(secondUpdate).resolves.toMatchObject({ avatarUrl: avatarUrl(secondPath) });
    expect(mocks.row?.avatarUrl).toBe(avatarUrl(secondPath));
    expect(mocks.storageObjects).toEqual(new Set([secondPath, otherUserPath]));
    expect(removedPaths()).toEqual([originalPath, firstPath]);
    expect(removedPaths()).not.toContain(secondPath);
    expect(mocks.forUpdate).toHaveBeenCalledTimes(2);
  });

  it("serializes an upload before removal and deletes only superseded objects", async () => {
    const upload = deferred<UploadedAvatar>();
    mocks.uploadProfileAvatar.mockImplementationOnce(async () => {
      const uploaded = await upload.promise;
      mocks.storageObjects.add(uploaded.path);
      return uploaded;
    });

    const uploadUpdate = updateProfile(currentUser(), input({
      username: "upload_save",
      avatar: imageFile("upload.jpg"),
    }));
    await vi.waitFor(() => expect(mocks.uploadProfileAvatar).toHaveBeenCalledOnce());

    const removeUpdate = updateProfile(currentUser(), input({
      username: "remove_save",
      removeAvatar: true,
    }));
    await vi.waitFor(() => expect(mocks.transaction).toHaveBeenCalledTimes(2));
    expect(mocks.row?.avatarUrl).toBe(avatarUrl(originalPath));

    upload.resolve(uploadedAvatar(firstPath));

    await expect(uploadUpdate).resolves.toMatchObject({ avatarUrl: avatarUrl(firstPath) });
    await expect(removeUpdate).resolves.toMatchObject({ avatarUrl: null });
    expect(mocks.row?.avatarUrl).toBeNull();
    expect(mocks.storageObjects).toEqual(new Set([otherUserPath]));
    expect(removedPaths()).toEqual([originalPath, firstPath]);
  });

  it("keeps the committed avatar when previous-object cleanup fails", async () => {
    mocks.removeFailures.add(originalPath);
    mocks.uploadProfileAvatar.mockImplementationOnce(async () => {
      const uploaded = uploadedAvatar(firstPath);
      mocks.storageObjects.add(uploaded.path);
      return uploaded;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(updateProfile(currentUser(), input({
      avatar: imageFile("replacement.jpg"),
    }))).resolves.toMatchObject({ avatarUrl: avatarUrl(firstPath) });

    expect(mocks.row?.avatarUrl).toBe(avatarUrl(firstPath));
    expect(mocks.storageObjects).toEqual(new Set([originalPath, firstPath, otherUserPath]));
    expect(removedPaths()).toEqual([originalPath]);
    expect(removedPaths()).not.toContain(firstPath);
    expect(consoleError).toHaveBeenCalledWith("Profile avatar cleanup failed.", "storage unavailable");
    consoleError.mockRestore();
  });

  it("removes a fresh upload after a database write failure without touching the current avatar", async () => {
    mocks.updateFailures = 1;
    mocks.uploadProfileAvatar.mockImplementationOnce(async () => {
      const uploaded = uploadedAvatar(firstPath);
      mocks.storageObjects.add(uploaded.path);
      return uploaded;
    });

    await expect(updateProfile(currentUser(), input({
      avatar: imageFile("replacement.jpg"),
    }))).rejects.toThrow("database unavailable");

    expect(mocks.row?.avatarUrl).toBe(avatarUrl(originalPath));
    expect(mocks.storageObjects).toEqual(new Set([originalPath, otherUserPath]));
    expect(removedPaths()).toEqual([firstPath]);
    expect(removedPaths()).not.toContain(originalPath);
  });

  it("preserves a fresh upload when a failed commit outcome shows it is current", async () => {
    mocks.commitOutcomeFailures = 1;
    mocks.uploadProfileAvatar.mockImplementationOnce(async () => {
      const uploaded = uploadedAvatar(firstPath);
      mocks.storageObjects.add(uploaded.path);
      return uploaded;
    });

    await expect(updateProfile(currentUser(), input({
      avatar: imageFile("replacement.jpg"),
    }))).rejects.toThrow("database commit outcome unavailable");

    expect(mocks.row?.avatarUrl).toBe(avatarUrl(firstPath));
    expect(mocks.storageObjects).toEqual(new Set([originalPath, firstPath, otherUserPath]));
    expect(removedPaths()).toEqual([]);
    expect(mocks.forUpdate).toHaveBeenCalledTimes(2);
  });

  it("never removes an avatar object owned by another user", async () => {
    mocks.uploadProfileAvatar.mockImplementationOnce(async () => {
      const uploaded = uploadedAvatar(firstPath);
      mocks.storageObjects.add(uploaded.path);
      return uploaded;
    });

    await updateProfile(currentUser(), input({ avatar: imageFile("replacement.jpg") }));

    expect(mocks.storageObjects).toContain(otherUserPath);
    expect(removedPaths()).toEqual([originalPath]);
    expect(removedPaths()).not.toContain(otherUserPath);
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
      if (mocks.commitOutcomeFailures > 0) {
        mocks.commitOutcomeFailures -= 1;
        throw new Error("database commit outcome unavailable");
      }
      return result;
    } finally {
      release();
    }
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
        if (mocks.updateFailures > 0) {
          mocks.updateFailures -= 1;
          throw new Error("database unavailable");
        }
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

function uploadedAvatar(path: string): UploadedAvatar {
  return { path, publicUrl: avatarUrl(path) };
}

function avatarUrl(path: string): string {
  return `https://project.supabase.co/storage/v1/object/public/profile-avatars/${path}`;
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
