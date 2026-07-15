export const MAX_VOICE_MEMO_MS = 2 * 60 * 1000;
export const CAPTURE_FINALIZATION_TIMEOUT_MS = 5_000;
export const CAPTURE_CLIENT_TRANSCRIPTION_TIMEOUT_MS = 190_000;

export const CAPTURE_MIME_PREFERENCES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

export function chooseCaptureMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | undefined {
  return CAPTURE_MIME_PREFERENCES.find((mimeType) => isTypeSupported(mimeType));
}

export function formatRecordingDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
