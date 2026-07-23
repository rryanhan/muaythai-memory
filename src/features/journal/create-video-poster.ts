import { prepareImageForClientDecode } from "@/features/media/prepare-image-for-decode";

const POSTER_MAX_EDGE = 720;
export const POSTER_EXTRACTION_TIMEOUT_MS = 10_000;
const ANALYSIS_EDGE = 72;
const SAMPLE_FRACTIONS = [0.08, 0.2, 0.36, 0.54, 0.72] as const;

export type GeneratedVideoPoster = {
  file: File;
  timeSeconds: number;
};

export type VideoFrameScore = {
  score: number;
  usable: boolean;
  meanLuminance: number;
  darkRatio: number;
};

export type PosterExtractionOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

// Poster creation remains browser-side so private video bytes do not need a
// second server-side decode pass or a deployment-specific ffmpeg binary.
export async function createVideoPoster(
  file: File,
  options: PosterExtractionOptions = {},
): Promise<GeneratedVideoPoster | null> {
  return withVideo(file, async (video, signal) => {
    const times = sampleTimes(video.duration);
    let best: { score: number; timeSeconds: number } | null = null;

    for (const timeSeconds of times) {
      throwIfAborted(signal);
      await seekVideo(video, timeSeconds, signal);
      const frame = drawVideoFrame(video, ANALYSIS_EDGE);
      if (!frame) continue;
      const result = scoreVideoFrame(frame.context.getImageData(0, 0, frame.canvas.width, frame.canvas.height).data);
      if (result.usable && (!best || result.score > best.score)) {
        best = { score: result.score, timeSeconds };
      }
    }

    if (!best) return null;
    await seekVideo(video, best.timeSeconds, signal);
    const poster = await exportVideoFrame(video, signal);
    return poster ? { file: poster, timeSeconds: best.timeSeconds } : null;
  }, options);
}

export async function createVideoPosterAtTime(
  file: File,
  timeSeconds: number,
  options: PosterExtractionOptions = {},
): Promise<GeneratedVideoPoster> {
  const poster = await withVideo(file, async (video, signal) => {
    const safeTime = clampVideoTime(timeSeconds, video.duration);
    await seekVideo(video, safeTime, signal);
    const output = await exportVideoFrame(video, signal);
    return output ? { file: output, timeSeconds: safeTime } : null;
  }, options);
  if (!poster) throw new Error("A cover could not be created at that point in the video.");
  return poster;
}

export async function createPosterFromImage(
  file: File,
  options: Pick<PosterExtractionOptions, "signal"> = {},
): Promise<File> {
  const preparedFile = await prepareImageForClientDecode(file, {
    label: "Cover image",
    maxDecodeEdge: 2_048,
    signal: options.signal,
  });
  const sourceUrl = URL.createObjectURL(preparedFile);
  try {
    const image = await loadImage(sourceUrl, options.signal);
    const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cover image could not be prepared in this browser.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const output = await exportCanvas(canvas, options.signal);
    if (!output) throw new Error("Cover image could not be exported.");
    return output;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function scoreVideoFrame(data: Uint8ClampedArray): VideoFrameScore {
  const pixels = Math.floor(data.length / 4);
  if (pixels === 0) return { score: 0, usable: false, meanLuminance: 0, darkRatio: 1 };

  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let darkPixels = 0;
  for (let index = 0; index < pixels * 4; index += 4) {
    const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    luminanceTotal += luminance;
    luminanceSquaredTotal += luminance * luminance;
    if (luminance < 22) darkPixels += 1;
  }

  const meanLuminance = luminanceTotal / pixels;
  const variance = Math.max(0, luminanceSquaredTotal / pixels - meanLuminance * meanLuminance);
  const contrast = Math.sqrt(variance);
  const darkRatio = darkPixels / pixels;
  const usable = meanLuminance >= 18 && darkRatio <= 0.9;
  return {
    usable,
    meanLuminance,
    darkRatio,
    score: usable ? contrast * 1.35 + meanLuminance * 0.28 - darkRatio * 28 : 0,
  };
}

async function withVideo<T>(
  file: File,
  task: (video: HTMLVideoElement, signal: AbortSignal) => Promise<T>,
  options: PosterExtractionOptions,
): Promise<T | null> {
  throwIfAborted(options.signal);
  const budget = createExtractionBudget(options);
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = sourceUrl;

  try {
    await waitForEvent(video, "loadeddata", budget.signal);
    if (!video.videoWidth || !video.videoHeight) return null;
    return await task(video, budget.signal);
  } catch (error) {
    if (options.signal?.aborted) throw abortReason(options.signal);
    if (!budget.signal.aborted && isAbortError(error)) throw error;
    return null;
  } finally {
    budget.dispose();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

function sampleTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0.12) return [0];
  return [...new Set(SAMPLE_FRACTIONS.map((fraction) => clampVideoTime(duration * fraction, duration)))];
}

function clampVideoTime(timeSeconds: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, timeSeconds);
  const edgePadding = Math.min(0.12, duration * 0.04);
  return Math.min(Math.max(timeSeconds, edgePadding), Math.max(edgePadding, duration - edgePadding));
}

async function seekVideo(video: HTMLVideoElement, timeSeconds: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (Math.abs(video.currentTime - timeSeconds) < 0.015) return;
  video.currentTime = timeSeconds;
  await waitForEvent(video, "seeked", signal);
}

function drawVideoFrame(video: HTMLVideoElement, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

async function exportVideoFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<File | null> {
  throwIfAborted(signal);
  const frame = drawVideoFrame(video, POSTER_MAX_EDGE);
  return frame ? exportCanvas(frame.canvas, signal) : null;
}

async function exportCanvas(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<File | null> {
  const webp = await canvasToBlob(canvas, "image/webp", 0.84, signal);
  if (webp?.type === "image/webp") return new File([webp], "journal-poster.webp", { type: "image/webp" });
  const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.86, signal);
  return jpeg ? new File([jpeg], "journal-poster.jpg", { type: "image/jpeg" }) : null;
}

function waitForEvent(
  video: HTMLVideoElement,
  eventName: "loadeddata" | "seeked",
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    function handleAbort() {
      finish(() => reject(abortReason(signal)));
    }

    function finish(callback: () => void) {
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener("error", handleError);
      signal.removeEventListener("abort", handleAbort);
      callback();
    }

    function handleSuccess() {
      finish(resolve);
    }

    function handleError() {
      finish(() => reject(new Error("Video frame could not be decoded.")));
    }

    if (signal.aborted) {
      handleAbort();
      return;
    }
    video.addEventListener(eventName, handleSuccess);
    video.addEventListener("error", handleError);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    function finish(callback: () => void) {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
      callback();
    }
    function handleAbort() {
      image.src = "";
      finish(() => reject(abortReason(signal)));
    }
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    image.onload = () => finish(() => resolve(image));
    image.onerror = () => finish(() => reject(new Error("Cover image could not be decoded.")));
    signal?.addEventListener("abort", handleAbort, { once: true });
    image.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
  signal?: AbortSignal,
): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    function handleAbort() {
      reject(abortReason(signal));
    }
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
    canvas.toBlob((blob) => {
      signal?.removeEventListener("abort", handleAbort);
      if (!signal?.aborted) resolve(blob);
    }, type, quality);
  });
}

function createExtractionBudget(options: PosterExtractionOptions): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const handleExternalAbort = () => controller.abort(abortReason(options.signal));
  options.signal?.addEventListener("abort", handleExternalAbort, { once: true });
  const timeout = window.setTimeout(() => {
    controller.abort(new DOMException("Video frame extraction timed out.", "TimeoutError"));
  }, options.timeoutMs ?? POSTER_EXTRACTION_TIMEOUT_MS);

  return {
    signal: controller.signal,
    dispose() {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", handleExternalAbort);
    },
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("Video frame extraction was cancelled.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
