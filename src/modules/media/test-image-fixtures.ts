import type { SupportedImageMime } from "./image-metadata";

export function imageFile(
  mime: SupportedImageMime,
  width: number,
  height: number,
  options: { malformed?: boolean } = {},
): File {
  const bytes = mime === "image/png"
    ? pngBytes(width, height)
    : mime === "image/jpeg"
      ? jpegBytes(width, height)
      : webpBytes(width, height);
  const output = options.malformed ? bytes.slice(0, Math.max(12, bytes.length - 3)) : bytes;
  const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
  return new File([output], `fixture.${extension}`, { type: mime });
}

export function pngBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = new Uint8Array(new ArrayBuffer(13));
  writeUint32BigEndian(header, 0, width);
  writeUint32BigEndian(header, 4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const imageData = Uint8Array.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01]);
  return concatenate(signature, pngChunk("IHDR", header), pngChunk("IDAT", imageData), pngChunk("IEND"));
}

export function jpegBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08,
    0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x01,
    0xff, 0xd9,
  ]);
}

export function webpBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(new ArrayBuffer(11));
  payload.set([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a], 0);
  writeUint16LittleEndian(payload, 6, width);
  writeUint16LittleEndian(payload, 8, height);
  payload[10] = 1;

  const paddedLength = payload.length + (payload.length % 2);
  const bytes = new Uint8Array(new ArrayBuffer(12 + 8 + paddedLength));
  writeAscii(bytes, 0, "RIFF");
  writeUint32LittleEndian(bytes, 4, bytes.length - 8);
  writeAscii(bytes, 8, "WEBP");
  writeAscii(bytes, 12, "VP8 ");
  writeUint32LittleEndian(bytes, 16, payload.length);
  bytes.set(payload, 20);
  return bytes;
}

function pngChunk(type: string, data = new Uint8Array()): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(12 + data.length));
  writeUint32BigEndian(bytes, 0, data.length);
  writeAscii(bytes, 4, type);
  bytes.set(data, 8);
  writeUint32BigEndian(bytes, 8 + data.length, crc32(bytes, 4, 8 + data.length));
  return bytes;
}

function concatenate(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(new ArrayBuffer(parts.reduce((total, part) => total + part.length, 0)));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
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

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function writeUint16LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeUint32LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
