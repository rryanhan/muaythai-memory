import { afterEach, describe, expect, it, vi } from "vitest";
import { createCroppedAvatar } from "./create-cropped-avatar";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createCroppedAvatar MIME fallback", () => {
  it("uses encoded PNG bytes for the output MIME and filename when WebP export falls back", async () => {
    class LoadedImage {
      naturalHeight = 2_000;
      naturalWidth = 2_000;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", LoadedImage);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    } as unknown as CanvasRenderingContext2D);
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 0,
    ]);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((
      callback,
      _type,
    ) => {
      callback(new Blob([png], { type: "image/png" }));
    });

    const output = await createCroppedAvatar("blob:avatar", {
      height: 500,
      width: 500,
      x: 100,
      y: 200,
    });

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.9);
    expect(output.type).toBe("image/png");
    expect(output.name).toBe("profile-avatar.png");
    expect(drawImage).toHaveBeenCalled();
  });
});
