import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareImageForClientDecode } from "./prepare-image-for-decode";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prepareImageForClientDecode", () => {
  it("rejects unsafe encoded dimensions before invoking a browser decoder", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);

    await expect(prepareImageForClientDecode(pngFile(20_000, 2_000), {
      label: "Profile photo",
      maxDecodeEdge: 4_096,
    })).rejects.toThrow(/dimensions are too large/);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("rejects an oversized fallback when safe decoder downsampling is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined);

    await expect(prepareImageForClientDecode(pngFile(8_000, 4_000), {
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

    const output = await prepareImageForClientDecode(pngFile(8_000, 4_000), {
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

function pngFile(width: number, height: number): File {
  return new File([pngBytes(width, height)], "image.png", { type: "image/png" });
}

function pngBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(24));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  writeUint32(bytes, 16, width);
  writeUint32(bytes, 20, height);
  return bytes;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
