import {
  detectImageMime,
  readEncodedImageMetadata,
  type SupportedImageMime,
} from "@/modules/media/image-metadata";

const MAX_SAFE_SOURCE_EDGE = 16_384;
const MAX_SAFE_SOURCE_PIXELS = 64_000_000;

const extensionByMime: Record<SupportedImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PrepareImageOptions = {
  label: string;
  maxDecodeEdge: number;
  signal?: AbortSignal;
};

export async function prepareImageForClientDecode(
  file: File,
  options: PrepareImageOptions,
): Promise<File> {
  throwIfAborted(options.signal);
  const metadata = await readEncodedImageMetadata(file);
  throwIfAborted(options.signal);

  if (!metadata) {
    throw new Error(`${options.label} dimensions could not be read safely. Choose another JPEG, PNG, or WebP image.`);
  }
  if (metadata.mime !== file.type) {
    throw new Error(`${options.label} does not match its image format.`);
  }

  const pixels = metadata.width * metadata.height;
  if (
    metadata.width > MAX_SAFE_SOURCE_EDGE
    || metadata.height > MAX_SAFE_SOURCE_EDGE
    || pixels > MAX_SAFE_SOURCE_PIXELS
  ) {
    throw new Error(
      `${options.label} dimensions are too large. Choose an image under 64 megapixels and 16,384 pixels per side.`,
    );
  }

  const scale = Math.min(1, options.maxDecodeEdge / Math.max(metadata.width, metadata.height));
  if (scale === 1) return file;
  if (typeof createImageBitmap !== "function") {
    throw new Error(`${options.label} is too large to prepare safely in this browser. Choose a smaller image.`);
  }

  const width = Math.max(1, Math.round(metadata.width * scale));
  const height = Math.max(1, Math.round(metadata.height * scale));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high",
    });
  } catch (error) {
    throwIfAborted(options.signal);
    throw new Error(`${options.label} could not be downsampled safely. Choose a smaller image.`, { cause: error });
  }

  try {
    throwIfAborted(options.signal);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(`${options.label} could not be prepared in this browser.`);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, file.type, 0.9, options.signal);
    if (!blob) throw new Error(`${options.label} could not be downsampled.`);
    const mime = detectImageMime(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
    if (!mime) throw new Error(`${options.label} was downsampled to an unsupported image format.`);
    return new File([blob], `prepared-image.${extensionByMime[mime]}`, { type: mime });
  } finally {
    bitmap.close();
  }
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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("Image preparation was cancelled.", "AbortError");
}
