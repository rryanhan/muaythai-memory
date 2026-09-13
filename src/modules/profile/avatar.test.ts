import { beforeEach, describe, expect, it, vi } from "vitest";
import { imageFile, pngBytes } from "@/modules/media/test-image-fixtures";
import type { SupportedImageMime } from "@/modules/media/image-metadata";

const storageMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: storageMocks.createSupabaseAdminClient,
}));

import {
  getOwnedProfileAvatarPath,
  PROFILE_AVATAR_BUCKET,
  removeUploadedAvatars,
  validateAvatarFile,
} from "./avatar";

const avatarMimes: SupportedImageMime[] = ["image/jpeg", "image/png", "image/webp"];

beforeEach(() => {
  storageMocks.remove.mockReset().mockResolvedValue({ data: null, error: null });
  storageMocks.from.mockReset().mockReturnValue({ remove: storageMocks.remove });
  storageMocks.createSupabaseAdminClient.mockReset().mockReturnValue({
    storage: { from: storageMocks.from },
  });
});

describe("validateAvatarFile image boundaries", () => {
  it("rejects a 24-byte PNG dimension header without image data", async () => {
    const file = new File(
      [pngBytes(20_000, 20_000).slice(0, 24)],
      "header-only.png",
      { type: "image/png" },
    );

    await expect(validateAvatarFile(file)).rejects.toThrow(/malformed or incomplete/);
  });

  it.each(avatarMimes)("rejects malformed or truncated %s files", async (mime) => {
    await expect(validateAvatarFile(imageFile(mime, 1_024, 1_024, {
      malformed: true,
    }))).rejects.toThrow(/malformed or incomplete/);
  });

  it("rejects a recognizable signature that disagrees with the declared MIME", async () => {
    const file = new File([imageFile("image/jpeg", 64, 64)], "spoof.png", {
      type: "image/png",
    });

    await expect(validateAvatarFile(file)).rejects.toThrow(/does not match/);
  });

  it.each(avatarMimes)("rejects oversized %s dimensions", async (mime) => {
    await expect(validateAvatarFile(imageFile(mime, 5_000, 4_000)))
      .rejects.toThrow(/4096 pixels and 16 megapixels/);
  });

  it.each(avatarMimes)("accepts structurally complete bounded %s files", async (mime) => {
    await expect(validateAvatarFile(imageFile(mime, 1_024, 1_024)))
      .resolves.toMatchObject({ mime });
  });
});

describe("getOwnedProfileAvatarPath", () => {
  it("returns only a direct avatar object owned by the requested user", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const path = `${userId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
    const otherUserPath = "22222222-2222-4222-8222-222222222222/avatar.jpg";

    expect(getOwnedProfileAvatarPath(userId, avatarUrl(path))).toBe(path);
    expect(getOwnedProfileAvatarPath(userId, avatarUrl(otherUserPath))).toBeNull();
    expect(getOwnedProfileAvatarPath(userId, avatarUrl(`${userId}/nested/avatar.jpg`))).toBeNull();
  });
});

describe("removeUploadedAvatars", () => {
  it("does not construct a Storage client for an empty cleanup", async () => {
    await expect(removeUploadedAvatars([])).resolves.toBeUndefined();

    expect(storageMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(storageMocks.remove).not.toHaveBeenCalled();
  });

  it("uses one Storage client and chunks removals at 100 objects", async () => {
    const paths = Array.from({ length: 205 }, (_, index) => `user/avatar-${index}.jpg`);

    await removeUploadedAvatars(paths);

    expect(storageMocks.createSupabaseAdminClient).toHaveBeenCalledOnce();
    expect(storageMocks.from).toHaveBeenCalledOnce();
    expect(storageMocks.from).toHaveBeenCalledWith(PROFILE_AVATAR_BUCKET);
    expect(storageMocks.remove.mock.calls.map(([batch]) => (batch as string[]).length))
      .toEqual([100, 100, 5]);
    expect(storageMocks.remove.mock.calls.flatMap(([batch]) => batch as string[]))
      .toEqual(paths);
  });
});

function avatarUrl(path: string): string {
  return `https://project.supabase.co/storage/v1/object/public/profile-avatars/${path}`;
}
