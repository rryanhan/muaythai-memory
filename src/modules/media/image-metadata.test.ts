import { describe, expect, it } from "vitest";
import {
  MAX_SAFE_UPLOADED_IMAGE_EDGE,
  MAX_SAFE_UPLOADED_IMAGE_PIXELS,
  inspectEncodedImage,
} from "./image-metadata";

describe("inspectEncodedImage bounded PNG validation", () => {
  it("rejects a max-size forged first chunk without scanning its payload", () => {
    const bytes = new Uint8Array(5 * 1024 * 1024);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    writeUint32BigEndian(bytes, 8, bytes.length - 20);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    const observed = observeIndexedReads(bytes, 64);

    expect(inspectEncodedImage(observed.bytes, {
      maxEdge: MAX_SAFE_UPLOADED_IMAGE_EDGE,
      maxPixels: MAX_SAFE_UPLOADED_IMAGE_PIXELS,
    })).toEqual({ ok: false, reason: "malformed" });
    expect(observed.reads()).toBeLessThan(64);
  });
});

function observeIndexedReads(bytes: Uint8Array, limit: number): {
  bytes: Uint8Array;
  reads: () => number;
} {
  let reads = 0;
  const proxy = new Proxy(bytes, {
    get(target, property) {
      if (typeof property === "string" && /^\d+$/.test(property)) {
        reads += 1;
        if (reads > limit) throw new Error("PNG validation exceeded its fixed header-read budget.");
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { bytes: proxy, reads: () => reads };
}

function writeUint32BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
