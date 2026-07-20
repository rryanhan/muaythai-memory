const POSTER_MAX_EDGE = 640;
const POSTER_TIMEOUT_MS = 8000;

// Poster creation stays in the browser so the private video never needs a
// second server-side decode pass or deployment-specific ffmpeg binary.
export async function createVideoPoster(file: File): Promise<File | null> {
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = sourceUrl;

  try {
    await waitForEvent(video, "loadeddata", POSTER_TIMEOUT_MS);
    if (!video.videoWidth || !video.videoHeight) return null;

    const targetTime = Number.isFinite(video.duration)
      ? Math.min(Math.max(video.duration * 0.08, 0.08), 1)
      : 0;
    if (targetTime > 0 && video.duration > targetTime) {
      video.currentTime = targetTime;
      await waitForEvent(video, "seeked", POSTER_TIMEOUT_MS);
    }

    const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const webp = await canvasToBlob(canvas, "image/webp", 0.82);
    if (webp?.type === "image/webp") {
      return new File([webp], "journal-poster.webp", { type: "image/webp" });
    }

    const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.84);
    return jpeg ? new File([jpeg], "journal-poster.jpg", { type: "image/jpeg" }) : null;
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
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

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
