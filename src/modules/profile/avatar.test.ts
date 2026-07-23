import { describe, expect, it } from "vitest";
import { imageFile, pngBytes } from "@/modules/media/test-image-fixtures";
import type { SupportedImageMime } from "@/modules/media/image-metadata";
import { validateAvatarFile } from "./avatar";

const avatarMimes: SupportedImageMime[] = ["image/jpeg", "image/png", "image/webp"];

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
