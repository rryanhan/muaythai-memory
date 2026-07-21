import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  JOURNAL_MEDIA_BUCKET,
  JOURNAL_POSTER_MAX_BYTES,
  JOURNAL_POSTER_MIME_TYPES,
  type JournalPosterMime,
} from "./constants";

export class JournalPosterError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "JournalPosterError";
    this.status = status;
  }
}

export async function uploadJournalPosterObject(
  userId: string,
  entryId: string,
  file: File,
): Promise<string> {
  const { bytes, mimeType } = await validateJournalPoster(file);
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${entryId}/poster-${randomUUID()}.${extension}`;
  const { error } = await createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET).upload(path, bytes, {
    cacheControl: "31536000",
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new JournalPosterError("Journal poster could not be uploaded. Try again.", 503);
  return path;
}

async function validateJournalPoster(file: File): Promise<{ bytes: Uint8Array; mimeType: JournalPosterMime }> {
  if (file.size === 0) throw new JournalPosterError("The generated journal poster was empty.");
  if (file.size > JOURNAL_POSTER_MAX_BYTES) throw new JournalPosterError("Journal posters must be 1 MB or smaller.", 413);
  if (!JOURNAL_POSTER_MIME_TYPES.includes(file.type as JournalPosterMime)) {
    throw new JournalPosterError("Journal posters must be JPEG or WebP images.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = file.type === "image/jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  if (!valid) throw new JournalPosterError("The generated poster did not match its image format.");

  return { bytes, mimeType: file.type as JournalPosterMime };
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
