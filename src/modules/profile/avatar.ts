import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type SupportedAvatarMime = (typeof PROFILE_AVATAR_MIME_TYPES)[number];

const extensionByMime: Record<SupportedAvatarMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class AvatarValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AvatarValidationError";
    this.status = status;
  }
}

export type UploadedAvatar = {
  path: string;
  publicUrl: string;
};

export async function uploadProfileAvatar(userId: string, file: File): Promise<UploadedAvatar> {
  const validated = await validateAvatarFile(file);
  const path = `${userId}/${randomUUID()}.${extensionByMime[validated.mime]}`;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(path, validated.bytes, {
    cacheControl: "31536000",
    contentType: validated.mime,
    upsert: false,
  });

  if (error) {
    throw new Error(`Avatar upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function removeUploadedAvatar(path: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
  if (error) throw new Error(`Avatar cleanup failed: ${error.message}`);
}

export async function removeOtherUserAvatars(userId: string, keepPath: string | null): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const bucket = supabase.storage.from(PROFILE_AVATAR_BUCKET);
  const pathsToRemove: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await bucket.list(userId, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Avatar listing failed: ${error.message}`);

    for (const object of data) {
      const path = `${userId}/${object.name}`;
      if (path !== keepPath) pathsToRemove.push(path);
    }

    if (data.length < 100) break;
    offset += data.length;
  }

  for (let index = 0; index < pathsToRemove.length; index += 100) {
    const { error } = await bucket.remove(pathsToRemove.slice(index, index + 100));
    if (error) throw new Error(`Avatar cleanup failed: ${error.message}`);
  }
}

export async function validateAvatarFile(file: File): Promise<{ bytes: Uint8Array; mime: SupportedAvatarMime }> {
  if (file.size === 0) throw new AvatarValidationError("Choose a non-empty image.");
  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    throw new AvatarValidationError("Profile photos must be 5 MB or smaller.", 413);
  }

  if (!isSupportedAvatarMime(file.type)) {
    throw new AvatarValidationError("Use a JPEG, PNG, or WebP image.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(bytes, file.type)) {
    throw new AvatarValidationError("The selected file does not match its image format.");
  }

  return { bytes, mime: file.type };
}

function isSupportedAvatarMime(value: string): value is SupportedAvatarMime {
  return PROFILE_AVATAR_MIME_TYPES.includes(value as SupportedAvatarMime);
}

function matchesSignature(bytes: Uint8Array, mime: SupportedAvatarMime): boolean {
  if (mime === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mime === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }

  return (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  );
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
