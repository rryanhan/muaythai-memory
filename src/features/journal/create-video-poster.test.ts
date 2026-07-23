import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVideoPoster } from "./create-video-poster";

let video: HTMLVideoElement;
let load: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  video = document.createElement("video");
  Object.defineProperties(video, {
    videoWidth: { configurable: true, value: 1_920 },
    videoHeight: { configurable: true, value: 1_080 },
    duration: { configurable: true, value: 10 },
  });
  load = vi.fn();
  Object.defineProperty(video, "load", { configurable: true, value: load });

  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((
    tagName: string,
    options?: ElementCreationOptions,
  ) => tagName === "video" ? video : createElement(tagName, options)) as typeof document.createElement);

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:poster-source"),
  });
  revokeObjectUrl = vi.fn();
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectUrl,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createVideoPoster extraction budget", () => {
  it("uses one time budget across metadata loading and frame seeks", async () => {
    const extraction = createVideoPoster(videoFile(), { timeoutMs: 100 });

    await vi.advanceTimersByTimeAsync(60);
    video.dispatchEvent(new Event("loadeddata"));
    await vi.advanceTimersByTimeAsync(39);

    let settled = false;
    void extraction.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(extraction).resolves.toBeNull();
    expect(video.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:poster-source");
  });

  it("cancels decoding and releases the video source immediately", async () => {
    const controller = new AbortController();
    const extraction = createVideoPoster(videoFile(), {
      signal: controller.signal,
      timeoutMs: 10_000,
    });

    controller.abort();

    await expect(extraction).rejects.toMatchObject({ name: "AbortError" });
    expect(video.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:poster-source");
  });
});

function videoFile(): File {
  return new File([new Uint8Array([1])], "training.mp4", { type: "video/mp4" });
}
