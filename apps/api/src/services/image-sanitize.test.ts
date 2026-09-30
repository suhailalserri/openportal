import { describe, it, expect } from "vitest";
import { sanitizeImage, readExifOrientation, orientationOnlyExif, IMAGE_LIMITS } from "./image-sanitize";

const enc = new TextEncoder();
const cat = (...p: Array<Uint8Array | number[]>) => {
  const arrs = p.map((x) => (x instanceof Uint8Array ? x : Uint8Array.from(x)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrs) { out.set(a, at); at += a.length; }
  return out;
};
const u16 = (n: number) => [n >> 8, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const l32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const has = (hay: Uint8Array, needle: string) => Buffer.from(hay).includes(Buffer.from(needle));

// ── builders ────────────────────────────────────────────────────────────
function exifSegment(orientation: number, extra = "GPS-LAT-12.34"): Uint8Array {
  const body = cat(
    enc.encode("Exif\0\0"),
    [0x49, 0x49, 42, 0, 8, 0, 0, 0],                          // little-endian, IFD0 at 8
    [1, 0],                                                     // 1 entry
    [0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0],       // orientation
    [0, 0, 0, 0],
    enc.encode(extra),
  );
  return cat([0xff, 0xe1], u16(body.length + 2), body);
}
function seg(marker: number, body: number[] | Uint8Array): Uint8Array {
  const b = body instanceof Uint8Array ? body : Uint8Array.from(body);
  return cat([0xff, marker], u16(b.length + 2), b);
}
function makeJpeg(opts: { w?: number; h?: number; orientation?: number } = {}): Uint8Array {
  const { w = 640, h = 480, orientation = 6 } = opts;
  return cat(
    [0xff, 0xd8],
    seg(0xe0, [...enc.encode("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    exifSegment(orientation),
    seg(0xfe, enc.encode("secret-comment")),
    seg(0xe2, enc.encode("ICC_PROFILE\0junk")),
    seg(0xed, enc.encode("Photoshop 3.0\0iptc-data")),
    seg(0xdb, new Array(65).fill(1)),
    seg(0xc0, [8, ...u16(h), ...u16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    seg(0xc4, new Array(20).fill(2)),
    seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]),
    [0x12, 0x34, 0xff, 0x00, 0x56],                              // entropy data incl. stuffed FF00
    [0xff, 0xd9],
  );
}
function pngChunk(type: string, data: Uint8Array | number[]): Uint8Array {
  const d = data instanceof Uint8Array ? data : Uint8Array.from(data);
  return cat(u32(d.length), enc.encode(type), d, [0, 0, 0, 0]);
}
function makePngFixture(w = 100, h = 50): Uint8Array {
  return cat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk("IHDR", [...u32(w), ...u32(h), 8, 2, 0, 0, 0]),
    pngChunk("tEXt", enc.encode("Author\0Jane Doe secret")),
    pngChunk("eXIf", enc.encode("exif-gps")),
    pngChunk("tIME", [0, 0, 0, 0, 0, 0, 0]),
    pngChunk("iTXt", enc.encode("XML:com.adobe.xmp\0xmp-data")),
    pngChunk("IDAT", [1, 2, 3, 4]),
    pngChunk("IEND", []),
  );
}
function webpChunk(tag: string, data: number[] | Uint8Array): Uint8Array {
  const d = data instanceof Uint8Array ? data : Uint8Array.from(data);
  return cat(enc.encode(tag), l32(d.length), d, d.length & 1 ? [0] : []);
}
function makeWebpFixture(w = 320, h = 200): Uint8Array {
  const vp8xData = [0x08 | 0x04 | 0x20 | 0x10, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, 0, (h - 1) & 255, ((h - 1) >> 8) & 255, 0];
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  const body = cat(
    enc.encode("WEBP"),
    webpChunk("VP8X", vp8xData),
    webpChunk("ICCP", enc.encode("icc-profile")),
    webpChunk("VP8L", [0x2f, ...l32(bits), 9, 9, 9]),
    webpChunk("EXIF", enc.encode("exif-gps-data")),
    webpChunk("XMP ", enc.encode("xmp-secret")),
  );
  return cat(enc.encode("RIFF"), l32(body.length), body);
}
function makeGifFixture(w = 10, h = 12): Uint8Array {
  return cat(
    enc.encode("GIF89a"), [w & 255, w >> 8, h & 255, h >> 8, 0x80, 0, 0],
    [0, 0, 0, 255, 255, 255],                                                      // 2-colour global table
    [0x21, 0xfe, 6, ...enc.encode("secret"), 0],                                   // comment
    [0x21, 0xff, 11, ...enc.encode("XMP DataXMP"), 3, 1, 2, 3, 0],                 // XMP app extension
    [0x21, 0xff, 11, ...enc.encode("NETSCAPE2.0"), 3, 1, 0, 0, 0],                 // loop: kept
    [0x21, 0xf9, 4, 0, 0, 0, 0, 0],                                                // graphic control: kept
    [0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 2, 2, 0x44, 0x01, 0],  // image
    [0x3b],
  );
}

describe("JPEG", () => {
  it("drops EXIF/GPS, comment, ICC and IPTC, keeps structure, and reports dimensions", () => {
    const r = sanitizeImage(makeJpeg({ w: 640, h: 480 }), "image/jpeg");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.width, r.height]).toEqual([640, 480]);
    expect(has(r.bytes, "GPS-LAT")).toBe(false);
    expect(has(r.bytes, "secret-comment")).toBe(false);
    expect(has(r.bytes, "ICC_PROFILE")).toBe(false);
    expect(has(r.bytes, "Photoshop")).toBe(false);
    expect(has(r.bytes, "JFIF")).toBe(true);
    expect(r.bytes[0]).toBe(0xff);
    expect(r.bytes[1]).toBe(0xd8);
    expect([...r.bytes.subarray(-2)]).toEqual([0xff, 0xd9]);
    expect(Buffer.from(r.bytes).includes(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]))).toBe(true); // scan data untouched
  });

  it("keeps ONLY the orientation, as a minimal EXIF block", () => {
    const r = sanitizeImage(makeJpeg({ orientation: 6 }), "image/jpeg");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const i = Buffer.from(r.bytes).indexOf(Buffer.from("Exif\0\0"));
    expect(i).toBeGreaterThan(0);
    expect(readExifOrientation(r.bytes.subarray(i, i + 32))).toBe(6);
    expect(has(r.bytes, "GPS")).toBe(false);
  });

  it("writes no EXIF at all for orientation 1 (normal)", () => {
    const r = sanitizeImage(makeJpeg({ orientation: 1 }), "image/jpeg");
    expect(r.ok).toBe(true);
    if (r.ok) expect(has(r.bytes, "Exif")).toBe(false);
  });

  it("orientationOnlyExif round-trips through readExifOrientation", () => {
    for (let o = 2; o <= 8; o++) expect(readExifOrientation(orientationOnlyExif(o).subarray(4))).toBe(o);
  });

  it("rejects a truncated file and one without a scan", () => {
    const j = makeJpeg();
    expect(sanitizeImage(j.subarray(0, 40), "image/jpeg")).toEqual({ ok: false, reason: "INVALID_IMAGE" });
    expect(sanitizeImage(cat([0xff, 0xd8], seg(0xe0, [1, 2, 3])), "image/jpeg")).toEqual({ ok: false, reason: "INVALID_IMAGE" });
  });

  it("rejects dimensions over the cap", () => {
    const r = sanitizeImage(makeJpeg({ w: IMAGE_LIMITS.maxSide + 1, h: 100 }), "image/jpeg");
    expect(r).toEqual({ ok: false, reason: "IMAGE_DIMENSIONS" });
    expect(sanitizeImage(makeJpeg({ w: 7_000, h: 7_000 }), "image/jpeg")).toEqual({ ok: false, reason: "IMAGE_DIMENSIONS" }); // 49 MP
  });
});

describe("PNG", () => {
  it("drops text, eXIf, tIME and iTXt chunks, keeps IHDR/IDAT/IEND", () => {
    const r = sanitizeImage(makePngFixture(100, 50), "image/png");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.width, r.height]).toEqual([100, 50]);
    for (const t of ["tEXt", "eXIf", "tIME", "iTXt", "Jane Doe", "xmp-data"]) expect(has(r.bytes, t)).toBe(false);
    for (const t of ["IHDR", "IDAT", "IEND"]) expect(has(r.bytes, t)).toBe(true);
  });

  it("rejects a file that does not start with IHDR, or has no IEND", () => {
    const bad = cat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pngChunk("IDAT", [1]), pngChunk("IEND", []));
    expect(sanitizeImage(bad, "image/png").ok).toBe(false);
    const noEnd = makePngFixture().subarray(0, makePngFixture().length - 12);
    expect(sanitizeImage(noEnd, "image/png").ok).toBe(false);
  });

  it("rejects a chunk length that runs past the file (no out-of-bounds read)", () => {
    const b = makePngFixture();
    new DataView(b.buffer, b.byteOffset).setUint32(33, 0x7ffffff0); // first chunk after IHDR claims a huge length
    expect(sanitizeImage(b, "image/png")).toEqual({ ok: false, reason: "INVALID_IMAGE" });
  });

  it("rejects a decompression-bomb-sized canvas", () => {
    expect(sanitizeImage(makePngFixture(30_000, 30_000), "image/png")).toEqual({ ok: false, reason: "IMAGE_DIMENSIONS" });
  });
});

describe("WebP", () => {
  it("drops EXIF/XMP/ICCP, clears their VP8X flags, fixes the RIFF size", () => {
    const r = sanitizeImage(makeWebpFixture(320, 200), "image/webp");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.width, r.height]).toEqual([320, 200]);
    for (const t of ["EXIF", "XMP ", "ICCP", "xmp-secret", "exif-gps-data"]) expect(has(r.bytes, t)).toBe(false);
    expect(has(r.bytes, "VP8L")).toBe(true);
    const vp8x = Buffer.from(r.bytes).indexOf(Buffer.from("VP8X"));
    expect(r.bytes[vp8x + 8]! & (0x20 | 0x08 | 0x04)).toBe(0);
    expect(r.bytes[vp8x + 8]! & 0x10).toBe(0x10); // alpha flag kept
    const riffSize = new DataView(r.bytes.buffer, r.bytes.byteOffset).getUint32(4, true);
    expect(riffSize).toBe(r.bytes.length - 8);
  });

  it("rejects a chunk that overruns the RIFF container", () => {
    const b = makeWebpFixture();
    new DataView(b.buffer, b.byteOffset).setUint32(16, 0xffff, true); // VP8X size
    expect(sanitizeImage(b, "image/webp").ok).toBe(false);
  });
});

describe("GIF", () => {
  it("drops comment and XMP extensions, keeps loop + graphic control + image", () => {
    const r = sanitizeImage(makeGifFixture(10, 12), "image/gif");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.width, r.height]).toEqual([10, 12]);
    expect(has(r.bytes, "secret")).toBe(false);
    expect(has(r.bytes, "XMP Data")).toBe(false);
    expect(has(r.bytes, "NETSCAPE2.0")).toBe(true);
    expect(r.bytes.at(-1)).toBe(0x3b);
  });

  it("rejects a file without a trailer or with an unknown block", () => {
    const g = makeGifFixture();
    expect(sanitizeImage(g.subarray(0, g.length - 1), "image/gif").ok).toBe(false);
    const weird = cat(g.subarray(0, 19), [0x99], g.subarray(19));
    expect(sanitizeImage(weird, "image/gif").ok).toBe(false);
  });
});

describe("general", () => {
  it("never throws on garbage and rejects types outside the four rasters", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      for (let n = 0; n < 200; n++) {
        const junk = new Uint8Array(n); crypto.getRandomValues(junk.subarray(0, Math.min(n, 65536)));
        expect(sanitizeImage(junk, mime).ok).toBe(false);
      }
    }
    expect(sanitizeImage(makePngFixture(), "image/svg+xml")).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
  });

  it("never throws on a valid file truncated at every length", () => {
    for (const [fx, mime] of [[makeJpeg(), "image/jpeg"], [makePngFixture(), "image/png"], [makeWebpFixture(), "image/webp"], [makeGifFixture(), "image/gif"]] as const) {
      for (let n = 0; n < fx.length; n++) expect(() => sanitizeImage(fx.subarray(0, n), mime)).not.toThrow();
    }
  });
});
