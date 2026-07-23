export const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_SAFE_UPLOADED_IMAGE_EDGE = 4_096;
export const MAX_SAFE_UPLOADED_IMAGE_PIXELS = 16_777_216;

export type SupportedImageMime = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export type EncodedImageMetadata = {
  mime: SupportedImageMime;
  width: number;
  height: number;
};

export type EncodedImageInspection =
  | { ok: true; metadata: EncodedImageMetadata }
  | { ok: false; reason: "unsupported" | "malformed" | "dimensions" };

type ImageInspectionOptions = {
  allowedMimes?: readonly SupportedImageMime[];
  maxEdge?: number;
  maxPixels?: number;
};

const IMAGE_PARSE_MAX_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export async function readEncodedImageMetadata(file: File): Promise<EncodedImageMetadata | null> {
  if (file.size === 0 || file.size > IMAGE_PARSE_MAX_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspection = inspectEncodedImage(bytes);
  return inspection.ok ? inspection.metadata : null;
}

export function inspectEncodedImage(
  bytes: Uint8Array,
  options: ImageInspectionOptions = {},
): EncodedImageInspection {
  const mime = detectImageMime(bytes);
  if (!mime || (options.allowedMimes && !options.allowedMimes.includes(mime))) {
    return { ok: false, reason: "unsupported" };
  }

  const dimensions = mime === "image/png"
    ? readPngStructure(bytes)
    : mime === "image/jpeg"
      ? readJpegStructure(bytes)
      : readWebpStructure(bytes);
  if (!dimensions) return { ok: false, reason: "malformed" };

  const maxEdge = options.maxEdge ?? Number.POSITIVE_INFINITY;
  const maxPixels = options.maxPixels ?? Number.POSITIVE_INFINITY;
  if (
    dimensions.width > maxEdge
    || dimensions.height > maxEdge
    || dimensions.width * dimensions.height > maxPixels
  ) {
    return { ok: false, reason: "dimensions" };
  }

  return { ok: true, metadata: { mime, ...dimensions } };
}

export function detectImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function readPngStructure(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 8 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return null;
  let offset = 8;
  let dimensions: { width: number; height: number } | null = null;
  let colorType: number | null = null;
  let sawPalette = false;
  let sawImageData = false;
  let imageDataBytes = 0;

  while (offset + 12 <= bytes.length) {
    const length = readUint32BigEndian(bytes, offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (!Number.isSafeInteger(length) || dataEnd < dataStart || chunkEnd > bytes.length) return null;

    const type = ascii(bytes, typeStart, dataStart);
    const expectedCrc = readUint32BigEndian(bytes, dataEnd);
    if (crc32(bytes, typeStart, dataEnd) !== expectedCrc) return null;

    if (!dimensions) {
      if (type !== "IHDR" || length !== 13) return null;
      const width = readUint32BigEndian(bytes, dataStart);
      const height = readUint32BigEndian(bytes, dataStart + 4);
      const bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      if (
        !validDimensions(width, height)
        || !validPngBitDepth(bitDepth, colorType)
        || bytes[dataStart + 10] !== 0
        || bytes[dataStart + 11] !== 0
        || (bytes[dataStart + 12] !== 0 && bytes[dataStart + 12] !== 1)
      ) {
        return null;
      }
      dimensions = { width, height };
    } else if (type === "IHDR") {
      return null;
    } else if (type === "PLTE") {
      if (sawImageData || length === 0 || length % 3 !== 0 || length > 768) return null;
      sawPalette = true;
    } else if (type === "IDAT") {
      if (colorType === 3 && !sawPalette) return null;
      sawImageData = true;
      imageDataBytes += length;
    } else if (type === "IEND") {
      if (length !== 0 || !sawImageData || imageDataBytes === 0 || chunkEnd !== bytes.length) return null;
      return dimensions;
    } else if (isCriticalPngChunk(type)) {
      return null;
    }

    offset = chunkEnd;
  }

  return null;
}

function readJpegStructure(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let dimensions: { width: number; height: number } | null = null;
  let sawScan = false;
  let scanDataBytes = 0;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const markerStart = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) {
      return dimensions && sawScan && scanDataBytes > 0 && offset === bytes.length
        ? dimensions
        : null;
    }
    if (marker === 0xd8 || marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      return null;
    }
    if (offset + 2 > bytes.length) return null;
    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (isJpegStartOfFrame(marker)) {
      if (dimensions || segmentLength < 11) return null;
      const componentCount = bytes[offset + 7];
      const width = readUint16BigEndian(bytes, offset + 5);
      const height = readUint16BigEndian(bytes, offset + 3);
      if (
        !validDimensions(width, height)
        || componentCount === 0
        || componentCount > 4
        || segmentLength !== 8 + componentCount * 3
      ) {
        return null;
      }
      dimensions = { width, height };
    }

    if (marker !== 0xda) {
      offset += segmentLength;
      continue;
    }

    const scanComponents = bytes[offset + 2];
    if (scanComponents === 0 || segmentLength !== 6 + scanComponents * 2 || !dimensions) return null;
    sawScan = true;
    offset += segmentLength;

    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        scanDataBytes += 1;
        offset += 1;
        continue;
      }

      const scanMarkerStart = offset;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return null;
      const scanMarker = bytes[offset];
      if (scanMarker === 0x00) {
        scanDataBytes += 1;
        offset += 1;
        continue;
      }
      if (scanMarker >= 0xd0 && scanMarker <= 0xd7) {
        offset += 1;
        continue;
      }
      offset = scanMarkerStart;
      break;
    }

    if (offset === markerStart) return null;
  }

  return null;
}

function readWebpStructure(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 32
    || ascii(bytes, 0, 4) !== "RIFF"
    || ascii(bytes, 8, 12) !== "WEBP"
    || readUint32LittleEndian(bytes, 4) !== bytes.length - 8
  ) {
    return null;
  }

  let offset = 12;
  let extendedDimensions: { width: number; height: number } | null = null;
  let imageDimensions: { width: number; height: number } | null = null;

  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, offset + 4);
    const length = readUint32LittleEndian(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + (length % 2);
    if (!Number.isSafeInteger(length) || dataEnd < dataStart || chunkEnd > bytes.length) return null;
    if (length % 2 === 1 && bytes[dataEnd] !== 0) return null;

    if (type === "VP8X") {
      if (offset !== 12 || length !== 10 || extendedDimensions) return null;
      const flags = bytes[dataStart];
      if ((flags & 0xc1) !== 0 || (flags & 0x02) !== 0) return null;
      extendedDimensions = {
        width: 1 + readUint24LittleEndian(bytes, dataStart + 4),
        height: 1 + readUint24LittleEndian(bytes, dataStart + 7),
      };
    } else if (type === "VP8 ") {
      if (
        imageDimensions
        || length <= 10
        || (bytes[dataStart] & 0x01) !== 0
        || bytes[dataStart + 3] !== 0x9d
        || bytes[dataStart + 4] !== 0x01
        || bytes[dataStart + 5] !== 0x2a
      ) {
        return null;
      }
      imageDimensions = validDimensions(
        readUint16LittleEndian(bytes, dataStart + 6) & 0x3fff,
        readUint16LittleEndian(bytes, dataStart + 8) & 0x3fff,
      );
      if (!imageDimensions) return null;
    } else if (type === "VP8L") {
      if (
        imageDimensions
        || length <= 5
        || bytes[dataStart] !== 0x2f
        || (bytes[dataStart + 4] >> 5) !== 0
      ) {
        return null;
      }
      imageDimensions = validDimensions(
        1 + bytes[dataStart + 1] + ((bytes[dataStart + 2] & 0x3f) << 8),
        1 + (bytes[dataStart + 2] >> 6) + (bytes[dataStart + 3] << 2)
          + ((bytes[dataStart + 4] & 0x0f) << 10),
      );
      if (!imageDimensions) return null;
    } else if (type === "ANIM" || type === "ANMF") {
      return null;
    }

    offset = chunkEnd;
  }

  if (offset !== bytes.length || !imageDimensions) return null;
  if (
    extendedDimensions
    && (
      extendedDimensions.width !== imageDimensions.width
      || extendedDimensions.height !== imageDimensions.height
    )
  ) {
    return null;
  }
  return extendedDimensions ?? imageDimensions;
}

function validPngBitDepth(bitDepth: number, colorType: number): boolean {
  const allowed = colorType === 0
    ? [1, 2, 4, 8, 16]
    : colorType === 2
      ? [8, 16]
      : colorType === 3
        ? [1, 2, 4, 8]
        : colorType === 4 || colorType === 6
          ? [8, 16]
          : [];
  return allowed.includes(bitDepth);
}

function isCriticalPngChunk(type: string): boolean {
  const first = type.charCodeAt(0);
  return first >= 65 && first <= 90;
}

function isJpegStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function validDimensions(width: number, height: number): { width: number; height: number } | null {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
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

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]
    + bytes[offset + 1] * 256
    + bytes[offset + 2] * 65_536
    + bytes[offset + 3] * 16_777_216;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
