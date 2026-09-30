/**
 * P5.2b: image sanitizing for chat. Pure JS, no native dependency (a native image library such
 * as sharp was rejected in the 5.2b Phase Summary: prebuilt binaries clash with the image's
 * "no dev dependencies / native binary" CI checks).
 *
 * What it does: parses the container of PNG / JPEG / WebP / GIF, drops every metadata block
 * (EXIF incl. GPS, XMP, IPTC, comments, text chunks, ICC) and returns the bytes otherwise
 * untouched, plus the real pixel dimensions, which are checked against a cap.
 *
 * What it does NOT do (deliberate, weaker than the plan's "re-encode"): it never decodes or
 * re-encodes pixels. Pixel-level tricks (adversarial images) are not removed, and a hostile file
 * is only contained by the 5 MiB size cap, the dimension cap and the fact that this process
 * never decodes it (the provider does).
 *
 * JPEG exception: the EXIF orientation value is kept, as a minimal synthetic EXIF block that
 * holds nothing else, so a phone photo does not turn sideways for the model.
 */

export const IMAGE_LIMITS = {
  maxSide:   8_000,
  maxPixels: 40_000_000,
} as const;

export type ImageSanitizeResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: "INVALID_IMAGE" | "IMAGE_DIMENSIONS" | "UNSUPPORTED_TYPE" };

const INVALID = { ok: false, reason: "INVALID_IMAGE" } as const;

const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const be32 = (b: Uint8Array, i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const le24 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const le32 = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function dimsOk(w: number, h: number): boolean {
  return w > 0 && h > 0 && w <= IMAGE_LIMITS.maxSide && h <= IMAGE_LIMITS.maxSide && w * h <= IMAGE_LIMITS.maxPixels;
}

function done(bytes: Uint8Array, width: number, height: number): ImageSanitizeResult {
  return dimsOk(width, height) ? { ok: true, bytes, width, height } : { ok: false, reason: "IMAGE_DIMENSIONS" };
}

// ── JPEG ────────────────────────────────────────────────────────────────

/** Reads the orientation (1-8) out of an APP1 "Exif" segment body (after the 2 length bytes). 0 = none/invalid. */
export function readExifOrientation(seg: Uint8Array): number {
  if (seg.length < 14 || ascii(seg, 0, 6) !== "Exif\0\0") return 0;
  const t = 6; // TIFF header start
  const little = seg[t] === 0x49 && seg[t + 1] === 0x49;
  if (!little && !(seg[t] === 0x4d && seg[t + 1] === 0x4d)) return 0;
  const r16 = (i: number) => (little ? le16(seg, i) : be16(seg, i));
  const r32 = (i: number) => (little ? le32(seg, i) : be32(seg, i));
  if (r16(t + 2) !== 42) return 0;
  const ifd = t + r32(t + 4);
  if (ifd + 2 > seg.length) return 0;
  const count = r16(ifd);
  for (let n = 0; n < count && n < 256; n++) {
    const e = ifd + 2 + n * 12;
    if (e + 12 > seg.length) return 0;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : 0;
    }
  }
  return 0;
}

/** APP1 segment (marker + length + body) carrying ONLY the orientation tag. */
export function orientationOnlyExif(orientation: number): Uint8Array {
  const body = [
    0x45, 0x78, 0x69, 0x66, 0, 0,             // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8,       // big-endian TIFF header, IFD0 at 8
    0x00, 0x01,                               // one entry
    0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1,       // tag 0x0112, SHORT, count 1
    0x00, orientation, 0x00, 0x00,            // value
    0, 0, 0, 0,                               // no next IFD
  ];
  const len = body.length + 2;
  return Uint8Array.from([0xff, 0xe1, len >> 8, len & 0xff, ...body]);
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function sanitizeJpeg(b: Uint8Array): ImageSanitizeResult {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return INVALID;
  const app0: Uint8Array[] = [];
  const rest: Uint8Array[] = [];
  let orientation = 0;
  let width = 0, height = 0;
  let i = 2;
  let sawScan = false;

  while (i < b.length) {
    if (b[i] !== 0xff) return INVALID;
    while (b[i] === 0xff && i < b.length) i++; // fill bytes
    const m = b[i++];
    if (m === undefined) return INVALID;
    if (m === 0xd9) { rest.push(Uint8Array.from([0xff, 0xd9])); break; } // EOI
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { rest.push(Uint8Array.from([0xff, m])); continue; }
    if (i + 2 > b.length) return INVALID;
    const len = be16(b, i);
    if (len < 2 || i + len > b.length) return INVALID;
    const segBody = b.subarray(i + 2, i + len);
    const whole = b.subarray(i - 2, i + len);

    if (m === 0xda) { // SOS: entropy-coded data follows; copy the rest verbatim
      rest.push(b.subarray(i - 2));
      sawScan = true;
      break;
    }
    if (SOF.has(m)) {
      if (len < 8) return INVALID;
      height = be16(b, i + 3);
      width  = be16(b, i + 5);
      rest.push(whole);
    } else if (m === 0xe0) {
      app0.push(whole);
    } else if (m === 0xe1) {
      const o = readExifOrientation(segBody);
      if (o) orientation = o; // the segment itself is dropped
    } else if (m === 0xee) {
      rest.push(whole); // Adobe APP14: colour transform flag, needed to decode CMYK/YCCK
    } else if (m >= 0xe2 && m <= 0xef) {
      // APPn (ICC, IPTC/Photoshop, vendor data): dropped
    } else if (m === 0xfe) {
      // COM: dropped
    } else {
      rest.push(whole); // DQT, DHT, DRI, DAC ...: structural
    }
    i += len;
  }

  if (!sawScan || width === 0 || height === 0) return INVALID;
  const parts: Uint8Array[] = [Uint8Array.from([0xff, 0xd8]), ...app0];
  if (orientation > 1) parts.push(orientationOnlyExif(orientation));
  parts.push(...rest);
  return done(concat(parts), width, height);
}

// ── PNG ─────────────────────────────────────────────────────────────────

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Allowlist: everything not listed (tEXt, zTXt, iTXt, eXIf, tIME, iCCP, private chunks ...) is dropped. */
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA", "sRGB", "sBIT", "bKGD", "hIST", "pHYs", "sPLT", "acTL", "fcTL", "fdAT"]);

function sanitizePng(b: Uint8Array): ImageSanitizeResult {
  if (b.length < 33 || !PNG_SIG.every((v, k) => b[k] === v)) return INVALID;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8, width = 0, height = 0, sawIend = false, first = true;
  while (i + 12 <= b.length) {
    const len = be32(b, i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (len > 0x7fffffff || end > b.length) return INVALID;
    if (first) {
      if (type !== "IHDR" || len !== 13) return INVALID;
      width = be32(b, i + 8);
      height = be32(b, i + 12);
      first = false;
    }
    if (PNG_KEEP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") { sawIend = true; break; }
  }
  if (!sawIend || width === 0 || height === 0) return INVALID;
  return done(concat(parts), width, height);
}

// ── WebP ────────────────────────────────────────────────────────────────

function sanitizeWebp(b: Uint8Array): ImageSanitizeResult {
  if (b.length < 20 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return INVALID;
  const riffEnd = Math.min(8 + le32(b, 4), b.length);
  const chunks: Uint8Array[] = [];
  let i = 12, width = 0, height = 0;
  while (i + 8 <= riffEnd) {
    const tag = ascii(b, i, 4);
    const size = le32(b, i + 4);
    const padded = size + (size & 1);
    if (i + 8 + size > riffEnd) return INVALID;
    const data = b.subarray(i + 8, i + 8 + size);
    if (tag === "EXIF" || tag === "XMP " || tag === "ICCP") { i += 8 + padded; continue; }

    let chunk = b.slice(i, Math.min(i + 8 + padded, riffEnd));
    if (tag === "VP8X") {
      if (size < 10) return INVALID;
      chunk[8] = chunk[8]! & ~(0x20 | 0x08 | 0x04); // clear ICC / EXIF / XMP flags
      width = le24(data, 4) + 1;
      height = le24(data, 7) + 1;
    } else if (tag === "VP8 " && width === 0) {
      if (size < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return INVALID;
      width = le16(data, 6) & 0x3fff;
      height = le16(data, 8) & 0x3fff;
    } else if (tag === "VP8L" && width === 0) {
      if (size < 5 || data[0] !== 0x2f) return INVALID;
      const bits = le32(data, 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }
    if (chunk.length & 1) { const c = new Uint8Array(chunk.length + 1); c.set(chunk); chunk = c; } // keep even alignment
    chunks.push(chunk);
    i += 8 + padded;
  }
  if (chunks.length === 0 || width === 0 || height === 0) return INVALID;
  const body = concat(chunks);
  const head = new Uint8Array(12);
  head.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(head.buffer).setUint32(4, 4 + body.length, true);
  head.set([0x57, 0x45, 0x42, 0x50], 8);
  return done(concat([head, body]), width, height);
}

// ── GIF ─────────────────────────────────────────────────────────────────

function skipSubBlocks(b: Uint8Array, i: number): number {
  for (;;) {
    if (i >= b.length) return -1;
    const n = b[i]!;
    i += 1;
    if (n === 0) return i;
    i += n;
  }
}

function sanitizeGif(b: Uint8Array): ImageSanitizeResult {
  const sig = b.length >= 6 ? ascii(b, 0, 6) : "";
  if (sig !== "GIF87a" && sig !== "GIF89a") return INVALID;
  if (b.length < 13) return INVALID;
  const width = le16(b, 6), height = le16(b, 8);
  const flags = b[10]!;
  let i = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  if (i > b.length) return INVALID;
  const parts: Uint8Array[] = [b.subarray(0, i)];
  let sawTrailer = false, frames = 0;

  while (i < b.length) {
    const tag = b[i]!;
    if (tag === 0x3b) { parts.push(b.subarray(i, i + 1)); sawTrailer = true; break; }
    if (tag === 0x21) { // extension
      if (i + 2 > b.length) return INVALID;
      const label = b[i + 1]!;
      const end = skipSubBlocks(b, i + 2);
      if (end < 0) return INVALID;
      let keep = label === 0xf9; // graphic control (timing/transparency)
      if (label === 0xff && b[i + 2] === 11) {
        const app = ascii(b, i + 3, 11);
        keep = app === "NETSCAPE2.0" || app === "ANIMEXTS1.0"; // loop count only; XMP etc. dropped
      }
      if (keep) parts.push(b.subarray(i, end));
      i = end;
    } else if (tag === 0x2c) { // image
      if (i + 10 > b.length) return INVALID;
      const f = b[i + 9]!;
      let j = i + 10 + (f & 0x80 ? 3 * (1 << ((f & 7) + 1)) : 0);
      j += 1; // LZW minimum code size
      const end = skipSubBlocks(b, j);
      if (end < 0) return INVALID;
      parts.push(b.subarray(i, end));
      frames++;
      i = end;
    } else {
      return INVALID;
    }
  }
  if (!sawTrailer || frames === 0) return INVALID;
  return done(concat(parts), width, height);
}

// ── entry point ─────────────────────────────────────────────────────────

/** `mime` must be the REAL type (from detectMime), one of the four raster types the bucket allows. */
export function sanitizeImage(bytes: Uint8Array, mime: string): ImageSanitizeResult {
  try {
    switch (mime) {
      case "image/jpeg": return sanitizeJpeg(bytes);
      case "image/png":  return sanitizePng(bytes);
      case "image/webp": return sanitizeWebp(bytes);
      case "image/gif":  return sanitizeGif(bytes);
      default: return { ok: false, reason: "UNSUPPORTED_TYPE" };
    }
  } catch {
    return INVALID;
  }
}
