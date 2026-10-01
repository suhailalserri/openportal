/**
 * apps/web/features/chat/lib/attach-types.ts
 *
 * P6.3c. Which files the attach button accepts, decided in the browser BEFORE any upload so the person
 * gets an instant, specific answer instead of a failed upload. The server stays the authority: it
 * re-checks the declared type against the file's REAL bytes (extraction/file-type.ts), so a wrong
 * guess here is refused there, never trusted.
 *
 * HOW "ALMOST ANY FILE" WORKS: the model only ever receives TEXT (extracted from the file) or an IMAGE.
 * So a type is supported if we can turn it into one of those:
 *   - the TEXT FAMILY (code, data, markup, config, logs, ...) is sent as `text/plain`; the server
 *     verifies the bytes really are UTF-8 text. Browsers give these files empty or odd MIME types
 *     (`.py`, `.ts`, `.md`), so the decision is by extension, not by the browser's `type`.
 *   - Office formats the server can read: pdf, docx, xlsx, pptx, odt, ods, odp, rtf.
 *   - images: png, jpeg, webp, gif.
 * Never accepted, whatever the extension: archives, executables, SVG (script-capable), audio/video,
 * macro-enabled Office files, legacy binary Office (doc/xls/ppt), and any other binary: the model cannot
 * read them, so accepting them would only produce a confident answer about nothing.
 */

export const ATTACH_LIMITS = {
  maxFiles: 5,
  /** Mirrors BUCKETS.attachments.maxBytes (apps/api storage.policy.ts). */
  maxBytes: 20 * 1024 * 1024,
  /** Images are sent inline to the model, so they are capped lower (chat-attachments.policy.ts). */
  maxImageBytes: 5 * 1024 * 1024,
} as const;

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", webp: "image/webp", gif: "image/gif",
};
const IMAGE_MIMES = new Set(Object.values(IMAGE_MIME_BY_EXT));

const DOCUMENT_MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf", docx: DOCX_MIME, xlsx: XLSX_MIME, pptx: PPTX_MIME,
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation", rtf: "application/rtf",
};

const TEXT_EXTENSIONS: ReadonlySet<string> = new Set((
  "txt text md markdown mdx rst adoc asciidoc org tex bib csv tsv json jsonl ndjson geojson ipynb yaml yml toml ini cfg conf " +
  "properties xml xsl xsd rss atom html htm xhtml css scss sass less log sql graphql gql proto js jsx mjs cjs ts tsx mts cts " +
  "py pyi pyw rb php java kt kts scala groovy gradle c h cc cpp cxx hpp hh hxx cs fs fsx vb go rs swift m mm dart lua r jl pl pm " +
  "sh bash zsh fish ps1 psm1 bat cmd vue svelte astro hs lhs ml mli clj cljs edn erl hrl ex exs elm nim zig v sol tf tfvars hcl " +
  "cmake mk make dockerfile gitignore gitattributes editorconfig eslintrc prettierrc babelrc patch diff srt vtt ics vcf lock sum"
).split(" "));

/** Well-known file names that have no extension at all. */
const TEXT_FILE_NAMES: ReadonlySet<string> = new Set([
  "dockerfile", "makefile", "readme", "license", "licence", "changelog", "authors", "contributors", "notice", "procfile",
  "gemfile", "rakefile", "jenkinsfile", "vagrantfile", "brewfile", "cname", "codeowners",
]);

const ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "lz", "cab", "jar", "war"]);
const LEGACY_OFFICE_EXTENSIONS: ReadonlySet<string> = new Set(["doc", "xls", "ppt", "dot", "xlt", "pps", "pot"]);
const MACRO_OFFICE_EXTENSIONS: ReadonlySet<string> = new Set(["docm", "xlsm", "pptm", "dotm", "xltm", "potm", "xlsb"]);
const MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
  "mp3", "wav", "m4a", "aac", "ogg", "oga", "flac", "opus", "mp4", "m4v", "mov", "avi", "mkv", "webm", "wmv", "mpeg", "mpg",
]);
/** Executables and other opaque binaries: refused by name whatever MIME type the browser claims. */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  "exe", "msi", "dll", "sys", "bin", "com", "scr", "apk", "ipa", "dmg", "iso", "img", "so", "dylib", "o", "obj", "a", "lib",
  "class", "pyc", "pyo", "wasm", "deb", "rpm", "pkg", "appimage", "db", "sqlite", "sqlite3", "mdb", "pdb",
]);
/** Images the server cannot read (yet). The person is told to convert, which is faster than a mystery failure. */
const UNSUPPORTED_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(["heic", "heif", "bmp", "tif", "tiff", "avif", "ico", "psd", "raw", "dng"]);

export type AttachRejectReason =
  | "EMPTY" | "TOO_LARGE" | "IMAGE_TOO_LARGE" | "IMAGE_FORMAT" | "LEGACY_OFFICE" | "MACRO_OFFICE" | "ARCHIVE" | "MEDIA" | "UNSUPPORTED";

export type ClassifyResult =
  | { ok: true; mimeType: string; kind: "image" | "document" }
  | { ok: false; reason: AttachRejectReason };

export interface FileLike {
  name: string;
  type: string;
  size: number;
}

export function fileExtension(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").trim();
  const dot = base.lastIndexOf(".");
  // ".gitignore" is a name, not an extension of nothing: treat a leading dot as part of the name.
  return dot <= 0 ? (dot === 0 ? base.slice(1).toLowerCase() : "") : base.slice(dot + 1).toLowerCase();
}

export function classifyFile(file: FileLike): ClassifyResult {
  if (file.size <= 0) return { ok: false, reason: "EMPTY" };
  const ext = fileExtension(file.name);
  const type = (file.type ?? "").toLowerCase().split(";")[0]!.trim();
  const base = (file.name.split(/[\\/]/).pop() ?? "").trim().toLowerCase();

  // Hard refusals first, so an odd MIME type can never talk a file past them.
  if (ARCHIVE_EXTENSIONS.has(ext) || type === "application/zip" || type === "application/x-zip-compressed") return { ok: false, reason: "ARCHIVE" };
  if (MACRO_OFFICE_EXTENSIONS.has(ext)) return { ok: false, reason: "MACRO_OFFICE" };
  if (LEGACY_OFFICE_EXTENSIONS.has(ext)) return { ok: false, reason: "LEGACY_OFFICE" };
  if (MEDIA_EXTENSIONS.has(ext) || type.startsWith("audio/") || type.startsWith("video/")) return { ok: false, reason: "MEDIA" };
  if (BINARY_EXTENSIONS.has(ext) || ext === "svg" || type === "image/svg+xml") return { ok: false, reason: "UNSUPPORTED" };
  if (UNSUPPORTED_IMAGE_EXTENSIONS.has(ext) || (type.startsWith("image/") && !IMAGE_MIMES.has(type) && !(ext in IMAGE_MIME_BY_EXT))) {
    return { ok: false, reason: "IMAGE_FORMAT" };
  }

  // Images
  const imageMime = IMAGE_MIMES.has(type) ? type : IMAGE_MIME_BY_EXT[ext];
  if (imageMime) {
    if (file.size > ATTACH_LIMITS.maxImageBytes) return { ok: false, reason: "IMAGE_TOO_LARGE" };
    return { ok: true, mimeType: imageMime, kind: "image" };
  }

  // Everything else is capped at the general limit.
  const documentMime = DOCUMENT_MIME_BY_EXT[ext];
  const isText = TEXT_EXTENSIONS.has(ext) || TEXT_FILE_NAMES.has(base) || (ext === "" && type === "text/plain") ||
    // Unknown extension but the browser says it is text: trust it (the server checks the bytes anyway).
    (documentMime === undefined && type.startsWith("text/"));
  if (!documentMime && !isText) return { ok: false, reason: "UNSUPPORTED" };
  if (file.size > ATTACH_LIMITS.maxBytes) return { ok: false, reason: "TOO_LARGE" };
  return { ok: true, mimeType: documentMime ?? "text/plain", kind: "document" };
}

/** The `accept` list for the "Choose a file" picker. Advisory only (users can still pick "All files"). */
export const FILE_PICKER_ACCEPT = [
  ...Object.keys(DOCUMENT_MIME_BY_EXT), ...TEXT_EXTENSIONS, ...Object.keys(IMAGE_MIME_BY_EXT),
].map((e) => `.${e}`).join(",");

export const PHOTO_PICKER_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/** Display kind for a chip's icon: coarse on purpose (one colour per family, as in the design). */
export type FileFamily = "image" | "pdf" | "word" | "sheet" | "slides" | "code" | "text";

export function fileFamily(name: string, kind: "image" | "document"): FileFamily {
  if (kind === "image") return "image";
  const ext = fileExtension(name);
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "odt" || ext === "rtf") return "word";
  if (ext === "xlsx" || ext === "ods" || ext === "csv" || ext === "tsv") return "sheet";
  if (ext === "pptx" || ext === "odp") return "slides";
  if (["txt", "text", "md", "markdown", "mdx", "rst", "log"].includes(ext)) return "text";
  return "code";
}

/** 1536 -> "1.5 KB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export type AttachErrorKey =
  | "attachRejectEmpty" | "attachRejectTooLarge" | "attachRejectImageTooLarge" | "attachRejectImageFormat" | "attachRejectLegacy"
  | "attachRejectMacro" | "attachRejectArchive" | "attachRejectMedia" | "attachRejectUnsupported" | "attachRejectTooMany"
  | "attachErrType" | "attachErrSize" | "attachErrQuota" | "attachErrConversation" | "attachErrMismatch" | "attachErrCorrupt"
  | "attachErrNoText" | "attachErrEncoding" | "attachErrComplex" | "attachErrExtract" | "attachErrNetwork" | "attachErrUnavailable"
  | "attachErrGeneric";

const REJECT_KEYS: Record<AttachRejectReason, AttachErrorKey> = {
  EMPTY: "attachRejectEmpty", TOO_LARGE: "attachRejectTooLarge", IMAGE_TOO_LARGE: "attachRejectImageTooLarge",
  IMAGE_FORMAT: "attachRejectImageFormat", LEGACY_OFFICE: "attachRejectLegacy", MACRO_OFFICE: "attachRejectMacro",
  ARCHIVE: "attachRejectArchive", MEDIA: "attachRejectMedia", UNSUPPORTED: "attachRejectUnsupported",
};
export const rejectKey = (r: AttachRejectReason): AttachErrorKey => REJECT_KEYS[r];

/** Server / client codes -> copy key. Unknown -> generic. */
const ERROR_KEYS: Record<string, AttachErrorKey> = {
  INVALID_MIME: "attachErrType", UNSUPPORTED_MEDIA_TYPE: "attachErrType", INVALID_KIND: "attachErrType",
  FILE_TOO_LARGE: "attachErrSize", PAYLOAD_TOO_LARGE: "attachErrSize", INVALID_SIZE: "attachErrSize",
  QUOTA_DAILY: "attachErrQuota", QUOTA_BYTES: "attachErrQuota", TOO_MANY_REQUESTS: "attachErrQuota",
  CONVERSATION_NOT_FOUND: "attachErrConversation", NOT_FOUND: "attachErrConversation", OBJECT_NOT_FOUND: "attachErrNetwork",
  TYPE_MISMATCH: "attachErrMismatch", CORRUPT: "attachErrCorrupt", NO_TEXT: "attachErrNoText", TEXT_ENCODING: "attachErrEncoding",
  TOO_COMPLEX: "attachErrComplex", TIMEOUT: "attachErrExtract", MEMORY: "attachErrExtract", STALLED: "attachErrExtract",
  EXTRACT_FAILED: "attachErrExtract", DOWNLOAD_FAILED: "attachErrExtract", OBJECT_DELETED: "attachErrExtract",
  NETWORK: "attachErrNetwork", UPLOAD_FAILED: "attachErrNetwork",
  STORAGE_DISABLED: "attachErrUnavailable", QUEUE_UNAVAILABLE: "attachErrUnavailable", UPSTREAM: "attachErrUnavailable",
  UPSTREAM_UNREACHABLE: "attachErrUnavailable", BAD_GATEWAY: "attachErrUnavailable",
};
export const attachErrorKey = (code: string): AttachErrorKey => ERROR_KEYS[code] ?? "attachErrGeneric";
