import {
  SUPPORTED_IMAGE_MIME_TYPES,
  detectImageMime,
  type SupportedImageMime,
} from "@/modules/media/image-metadata";

export const AVATAR_IMAGE_MIME_TYPES = SUPPORTED_IMAGE_MIME_TYPES;
export type AvatarImageMime = SupportedImageMime;
export const detectAvatarImageMime = detectImageMime;
