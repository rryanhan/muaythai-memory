export const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type SupportedImageMime = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export type EncodedImageMetadata = {
  mime: SupportedImageMime;
  width: number;
  height: number;
};

const IMAGE_METADATA_SCAN_MAX_BYTES = 5 * 1024 * 1024;

export async function readEncodedImageMetadata(file: File): Promise<EncodedImageMetadata | null> {
  const bytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, IMAGE_METADATA_SCAN_MAX_BYTES)).arrayBuffer(),
  );
  const mime = detectImageMime(bytes);
  if (!mime) return null;
  const dimensions = readImageDimensions(bytes, mime);
  return dimensions ? { mime, ...dimensions } : null;
}

export function detectImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= pngSignature.length && pngSignature.every((value, index) => bytes[index] === value)) {
    return "image/png";
  }

  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }

  return null;
}

export function readImageDimensions(
  bytes: Uint8Array,
  mime: SupportedImageMime,
): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24 || ascii(bytes, 12, 16) !== "IHDR") return null;
    return validDimensions(readUint32BigEndian(bytes, 16), readUint32BigEndian(bytes, 20));
  }
  if (mime === "image/jpeg") return readJpegDimensions(bytes);
  return readWebpDimensions(bytes);
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda || offset + 1 >= bytes.length) break;

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
      return validDimensions(
        readUint16BigEndian(bytes, offset + 5),
        readUint16BigEndian(bytes, offset + 3),
      );
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X") {
    return validDimensions(
      1 + readUint24LittleEndian(bytes, 24),
      1 + readUint24LittleEndian(bytes, 27),
    );
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f && bytes.length >= 25) {
    const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    const height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    return validDimensions(width, height);
  }
  if (
    chunk === "VP8 "
    && bytes.length >= 30
    && bytes[23] === 0x9d
    && bytes[24] === 0x01
    && bytes[25] === 0x2a
  ) {
    return validDimensions(
      readUint16LittleEndian(bytes, 26) & 0x3fff,
      readUint16LittleEndian(bytes, 28) & 0x3fff,
    );
  }
  return null;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0
    && marker <= 0xcf
    && marker !== 0xc4
    && marker !== 0xc8
    && marker !== 0xcc
  );
}

function validDimensions(width: number, height: number): { width: number; height: number } | null {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 256 + bytes[offset + 1];
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 256;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65_536;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 16_777_216
    + bytes[offset + 1] * 65_536
    + bytes[offset + 2] * 256
    + bytes[offset + 3];
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
