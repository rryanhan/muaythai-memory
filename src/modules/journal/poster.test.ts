import { describe, expect, it } from "vitest";
import { imageFile } from "@/modules/media/test-image-fixtures";
import { validateJournalPoster } from "./poster";

const posterMimes = ["image/jpeg", "image/webp"] as const;

describe("validateJournalPoster image boundaries", () => {
  it.each(posterMimes)("rejects malformed or truncated %s files", async (mime) => {
    await expect(validateJournalPoster(imageFile(mime, 720, 720, {
      malformed: true,
    }))).rejects.toThrow(/malformed or incomplete/);
  });

  it("rejects a recognizable signature that disagrees with the declared MIME", async () => {
    const file = new File([imageFile("image/jpeg", 64, 64)], "spoof.webp", {
      type: "image/webp",
    });

    await expect(validateJournalPoster(file)).rejects.toThrow(/did not match/);
  });

  it.each(posterMimes)("rejects oversized %s dimensions", async (mime) => {
    await expect(validateJournalPoster(imageFile(mime, 5_000, 4_000)))
      .rejects.toThrow(/4096 pixels and 16 megapixels/);
  });

  it.each(posterMimes)("accepts structurally complete bounded %s files", async (mime) => {
    await expect(validateJournalPoster(imageFile(mime, 720, 720)))
      .resolves.toMatchObject({ mimeType: mime });
  });
});
