import { Upload, type PreviousUpload } from "tus-js-client";
import {
  JOURNAL_MEDIA_BUCKET,
  JOURNAL_UPLOAD_CHUNK_BYTES,
  JOURNAL_VIDEO_MAX_BYTES,
  isJournalVideoMime,
} from "@/modules/journal/constants";
import type { JournalUploadIntentResponse } from "@/modules/journal/contracts";

export class JournalFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalFileError";
  }
}

export function validateJournalVideoFile(file: File): void {
  if (file.size === 0) throw new JournalFileError("Choose a non-empty video.");
  if (file.size > JOURNAL_VIDEO_MAX_BYTES) throw new JournalFileError("Videos must be 50 MB or smaller.");
  if (!isJournalVideoMime(file.type)) throw new JournalFileError("Use an MP4, WebM, or QuickTime video.");
}

export function uploadJournalVideo({
  file,
  intent,
  signal,
  onProgress,
}: {
  file: File;
  intent: JournalUploadIntentResponse;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}): Promise<void> {
  validateJournalVideoFile(file);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abortUpload);
      callback();
    };
    const upload = new Upload(file, {
      endpoint: intent.upload.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { "x-signature": intent.upload.token },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: JOURNAL_UPLOAD_CHUNK_BYTES,
      metadata: {
        bucketName: JOURNAL_MEDIA_BUCKET,
        objectName: intent.upload.path,
        contentType: file.type,
        cacheControl: "31536000",
      },
      onError: (error) => finish(() => reject(error)),
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress(bytesTotal > 0 ? Math.min(100, (bytesUploaded / bytesTotal) * 100) : 0);
      },
      onSuccess: () => finish(resolve),
    });

    function abortUpload() {
      void upload.abort(true).finally(() => {
        finish(() => reject(new DOMException("Upload cancelled.", "AbortError")));
      });
    }

    if (signal.aborted) {
      abortUpload();
      return;
    }
    signal.addEventListener("abort", abortUpload, { once: true });

    void upload.findPreviousUploads()
      .then((previousUploads) => {
        if (signal.aborted || settled) return;
        const previousUpload = findMatchingPreviousUpload(previousUploads, intent);
        if (previousUpload) upload.resumeFromPreviousUpload(previousUpload);
        upload.start();
      })
      .catch((error) => finish(() => reject(error)));
  });
}

export function findMatchingPreviousUpload(
  previousUploads: PreviousUpload[],
  intent: JournalUploadIntentResponse,
): PreviousUpload | undefined {
  return previousUploads
    .filter((previousUpload) => (
      previousUpload.metadata?.bucketName === JOURNAL_MEDIA_BUCKET
      && previousUpload.metadata.objectName === intent.upload.path
      && isSameResumableEndpoint(previousUpload.uploadUrl, intent.upload.endpoint)
    ))
    .sort((left, right) => parseCreationTime(right.creationTime) - parseCreationTime(left.creationTime))[0];
}

function isSameResumableEndpoint(uploadUrl: string | null, endpoint: string): boolean {
  if (!uploadUrl) return false;
  try {
    const previous = new URL(uploadUrl);
    const current = new URL(endpoint);
    const resumablePath = current.pathname.replace(/\/sign\/?$/, "");
    return previous.origin === current.origin
      && previous.pathname.startsWith(`${resumablePath}/`);
  } catch {
    return false;
  }
}

function parseCreationTime(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
