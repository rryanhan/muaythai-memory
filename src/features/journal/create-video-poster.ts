const POSTER_MAX_EDGE = 720;
const POSTER_TIMEOUT_MS = 10_000;
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

// Poster creation remains browser-side so private video bytes do not need a
// second server-side decode pass or a deployment-specific ffmpeg binary.
export async function createVideoPoster(file: File): Promise<GeneratedVideoPoster | null> {
  return withVideo(file, async (video) => {
    const times = sampleTimes(video.duration);
    let best: { score: number; timeSeconds: number } | null = null;

    for (const timeSeconds of times) {
      await seekVideo(video, timeSeconds);
      const frame = drawVideoFrame(video, ANALYSIS_EDGE);
      if (!frame) continue;
      const result = scoreVideoFrame(frame.context.getImageData(0, 0, frame.canvas.width, frame.canvas.height).data);
      if (result.usable && (!best || result.score > best.score)) {
        best = { score: result.score, timeSeconds };
      }
    }

    if (!best) return null;
    await seekVideo(video, best.timeSeconds);
    const poster = await exportVideoFrame(video);
    return poster ? { file: poster, timeSeconds: best.timeSeconds } : null;
  });
}

export async function createVideoPosterAtTime(file: File, timeSeconds: number): Promise<GeneratedVideoPoster> {
  const poster = await withVideo(file, async (video) => {
    const safeTime = clampVideoTime(timeSeconds, video.duration);
    await seekVideo(video, safeTime);
    const output = await exportVideoFrame(video);
    return output ? { file: output, timeSeconds: safeTime } : null;
  });
  if (!poster) throw new Error("A cover could not be created at that point in the video.");
  return poster;
}

export async function createPosterFromImage(file: File): Promise<File> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cover image could not be prepared in this browser.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const output = await exportCanvas(canvas);
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

async function withVideo<T>(file: File, task: (video: HTMLVideoElement) => Promise<T>): Promise<T | null> {
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = sourceUrl;

  try {
    await waitForEvent(video, "loadeddata", POSTER_TIMEOUT_MS);
    if (!video.videoWidth || !video.videoHeight) return null;
    return await task(video);
  } catch {
    return null;
  } finally {
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

async function seekVideo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  if (Math.abs(video.currentTime - timeSeconds) < 0.015) return;
  video.currentTime = timeSeconds;
  await waitForEvent(video, "seeked", POSTER_TIMEOUT_MS);
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

async function exportVideoFrame(video: HTMLVideoElement): Promise<File | null> {
  const frame = drawVideoFrame(video, POSTER_MAX_EDGE);
  return frame ? exportCanvas(frame.canvas) : null;
}

async function exportCanvas(canvas: HTMLCanvasElement): Promise<File | null> {
  const webp = await canvasToBlob(canvas, "image/webp", 0.84);
  if (webp?.type === "image/webp") return new File([webp], "journal-poster.webp", { type: "image/webp" });
  const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.86);
  return jpeg ? new File([jpeg], "journal-poster.jpg", { type: "image/jpeg" }) : null;
}

function waitForEvent(video: HTMLVideoElement, eventName: "loadeddata" | "seeked", timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(() => reject(new Error("Video frame timed out."))), timeoutMs);

    function finish(callback: () => void) {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener("error", handleError);
      callback();
    }

    function handleSuccess() {
      finish(resolve);
    }

    function handleError() {
      finish(() => reject(new Error("Video frame could not be decoded.")));
    }

    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cover image could not be decoded."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
