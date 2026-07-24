export const JOURNAL_MEDIA_BUCKET = "journal-media";
export const JOURNAL_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const JOURNAL_VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const JOURNAL_POSTER_MAX_BYTES = 1024 * 1024;
export const JOURNAL_POSTER_MIME_TYPES = ["image/jpeg", "image/webp"] as const;
export const JOURNAL_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
export const JOURNAL_PLAYBACK_URL_SECONDS = 60 * 60;
export const JOURNAL_ABANDONED_UPLOAD_HOURS = 24;
export const JOURNAL_DELETE_TOMBSTONE_HOURS = 3;

export type JournalVideoMime = (typeof JOURNAL_VIDEO_MIME_TYPES)[number];
export type JournalPosterMime = (typeof JOURNAL_POSTER_MIME_TYPES)[number];

export function isJournalVideoMime(value: string): value is JournalVideoMime {
  return JOURNAL_VIDEO_MIME_TYPES.includes(value as JournalVideoMime);
}

export function journalVideoExtension(mimeType: JournalVideoMime): string {
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  return "mp4";
}
