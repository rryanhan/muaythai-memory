import { beforeEach, describe, expect, it, vi } from "vitest";
import { imageFile } from "@/modules/media/test-image-fixtures";

const storageMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: storageMocks.createSupabaseAdminClient,
}));

import { JOURNAL_MEDIA_BUCKET } from "./constants";
import { uploadJournalPosterObject, validateJournalPoster } from "./poster";

const posterMimes = ["image/jpeg", "image/webp"] as const;
const posterPath = "user/entry/poster-11111111-1111-4111-8111-111111111111.webp";

beforeEach(() => {
  storageMocks.upload.mockReset().mockResolvedValue({ data: null, error: null });
  storageMocks.from.mockReset().mockReturnValue({ upload: storageMocks.upload });
  storageMocks.createSupabaseAdminClient.mockReset().mockReturnValue({
    storage: { from: storageMocks.from },
  });
});

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

describe("uploadJournalPosterObject", () => {
  it("uses an injected bucket without constructing another admin client", async () => {
    const upload = vi.fn().mockResolvedValue({ data: null, error: null });

    await expect(uploadJournalPosterObject(
      "user",
      "entry",
      imageFile("image/webp", 720, 720),
      posterPath,
      { upload },
    )).resolves.toBe(posterPath);

    expect(storageMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith(
      posterPath,
      expect.any(Uint8Array),
      {
        cacheControl: "31536000",
        contentType: "image/webp",
        upsert: true,
      },
    );
  });

  it("keeps the public fallback and upload-error behavior", async () => {
    storageMocks.upload.mockResolvedValue({
      data: null,
      error: { message: "Storage unavailable" },
    });

    await expect(uploadJournalPosterObject(
      "user",
      "entry",
      imageFile("image/webp", 720, 720),
      posterPath,
    )).rejects.toMatchObject({
      message: "Journal poster could not be uploaded. Try again.",
      status: 503,
    });

    expect(storageMocks.createSupabaseAdminClient).toHaveBeenCalledOnce();
    expect(storageMocks.from).toHaveBeenCalledWith(JOURNAL_MEDIA_BUCKET);
    expect(storageMocks.upload).toHaveBeenCalledOnce();
  });

  it("still validates before constructing the fallback client", async () => {
    await expect(uploadJournalPosterObject(
      "user",
      "entry",
      imageFile("image/webp", 720, 720, { malformed: true }),
    )).rejects.toThrow(/malformed or incomplete/);

    expect(storageMocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(storageMocks.upload).not.toHaveBeenCalled();
  });
});
