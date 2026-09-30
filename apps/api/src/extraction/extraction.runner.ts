/**
 * P5.2a: runs one extraction in an isolated worker thread with a memory cap and a hard timeout.
 *
 * Limits: `resourceLimits` caps the thread's V8 heap; the wall-clock timeout terminates it.
 * NOT capped: Buffers/ArrayBuffers (the input is at most the 20 MiB bucket limit, downloaded by
 * the caller with its own byte cap). Never throws: every outcome is an ExtractResult.
 */
import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ATTACHMENT_LIMITS, type ExtractionErrorCode } from "../services/attachments.policy";
import type { ExtractResult } from "./extract";

export interface RunnerOptions {
  /** Worker script. Default: the bundled dist/extract.worker.js next to the running bundle. */
  workerFile?: string | URL;
  timeoutMs?: number;
  heapMb?: number;
}

/** dist/index.js and dist/extract.worker.js sit side by side (apps/api/build.mjs). */
export function defaultWorkerFile(): URL {
  // Deliberately NOT `new URL("./extract.worker.js", import.meta.url)`: webpack (the web app's
  // type-graph pulls this file in through the tRPC router) treats that literal as an asset import
  // and fails the build because only extract.worker.ts exists in source. A computed path is ignored.
  return pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "extract.worker.js"));
}

export function runExtraction(mime: string, bytes: Uint8Array, opts: RunnerOptions = {}): Promise<ExtractResult> {
  const timeoutMs = opts.timeoutMs ?? ATTACHMENT_LIMITS.extractTimeoutMs;
  const heapMb    = opts.heapMb ?? ATTACHMENT_LIMITS.workerHeapMb;
  const file      = opts.workerFile ?? defaultWorkerFile();

  const path = typeof file === "string" ? file : fileURLToPath(file);
  if (!existsSync(path)) {
    // Dev/test run from .ts sources: the bundled worker does not exist. Fail loudly, not silently.
    return Promise.resolve({ ok: false, code: "EXTRACT_FAILED" });
  }

  return new Promise<ExtractResult>((resolve) => {
    let settled = false;
    let worker: Worker;
    const done = (r: ExtractResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker?.terminate().catch(() => {});
      resolve(r);
    };
    const fail = (code: ExtractionErrorCode) => done({ ok: false, code });

    // Copy so the caller's buffer is not detached by the transfer.
    const copy = new Uint8Array(bytes);
    try {
      worker = new Worker(file, {
        workerData: { mime, bytes: copy },
        transferList: [copy.buffer as ArrayBuffer],
        resourceLimits: { maxOldGenerationSizeMb: heapMb, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      });
    } catch {
      resolve({ ok: false, code: "EXTRACT_FAILED" });
      return;
    }
    const timer = setTimeout(() => fail("TIMEOUT"), timeoutMs);

    worker.once("message", (msg: unknown) => {
      const m = msg as ExtractResult | null;
      if (m && typeof m === "object" && "ok" in m) done(m);
      else fail("EXTRACT_FAILED");
    });
    worker.once("error", (err: Error & { code?: string }) => {
      fail(err?.code === "ERR_WORKER_OUT_OF_MEMORY" ? "MEMORY" : "EXTRACT_FAILED");
    });
    worker.once("exit", () => fail("EXTRACT_FAILED")); // exited without a message
  });
}
