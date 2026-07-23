import { afterEach, describe, expect, it, vi } from "vitest";
import { imageFile, pngBytes } from "@/modules/media/test-image-fixtures";
import { prepareImageForClientDecode } from "./prepare-image-for-decode";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prepareImageForClientDecode", () => {
  it("rejects unsafe encoded dimensions before invoking a browser decoder", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);

    await expect(prepareImageForClientDecode(imageFile("image/png", 20_000, 2_000), {
      label: "Profile photo",
      maxDecodeEdge: 4_096,
    })).rejects.toThrow(/dimensions are too large/);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("rejects an oversized fallback when safe decoder downsampling is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined);

    await expect(prepareImageForClientDecode(imageFile("image/png", 8_000, 4_000), {
      label: "Cover image",
      maxDecodeEdge: 2_048,
    })).rejects.toThrow(/too large to prepare safely in this browser/);
  });

  it("uses decoder resize hints and a bounded canvas for acceptable large images", async () => {
    const bitmap = {
      close: vi.fn(),
      height: 2_048,
      width: 4_096,
    };
    const createBitmap = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", createBitmap);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob([pngBytes(4_096, 2_048)], { type: "image/png" }));
    });

    const output = await prepareImageForClientDecode(imageFile("image/png", 8_000, 4_000), {
      label: "Profile photo",
      maxDecodeEdge: 4_096,
    });

    expect(createBitmap).toHaveBeenCalledWith(expect.any(File), {
      resizeHeight: 2_048,
      resizeQuality: "high",
      resizeWidth: 4_096,
    });
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 4_096, 2_048);
    expect(output.type).toBe("image/png");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
