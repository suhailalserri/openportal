/**
 * P5.2a: worker_threads entry. Runs ONE extraction and posts the result, nothing else. The
 * parent (extraction.runner.ts) caps this thread's heap and terminates it on timeout, so a
 * hostile PDF/DOCX can hang or exhaust only this thread, never the api process.
 *
 * Built as its own esbuild entry (dist/extract.worker.js, see apps/api/build.mjs).
 */
import { parentPort, workerData } from "node:worker_threads";
import { extractDocumentText } from "./extract";

async function main() {
  const { mime, bytes } = workerData as { mime: string; bytes: Uint8Array };
  const result = await extractDocumentText(mime, bytes);
  parentPort!.postMessage(result);
}

main().catch(() => parentPort!.postMessage({ ok: false, code: "EXTRACT_FAILED" }));
