import { afterAll, beforeAll, describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { runExtraction } from "./extraction.runner";
import { DOCX_MIME } from "./file-type";
import { makeDocx, makePdf, PNG_BYTES } from "../test/fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
let tmp: string;     // plain-JS fake workers
let built: string;   // the REAL worker, bundled like production (apps/api/build.mjs)

const fake = (name: string, body: string) => {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, body);
  return f;
};

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aip-worker-"));
  // Inside apps/api so the externals (unpdf, fflate) resolve from apps/api/node_modules.
  const outDir = fs.mkdtempSync(path.join(here, "../../.test-worker-"));
  buildSync({
    entryPoints: [path.join(here, "extract.worker.ts")],
    outfile: path.join(outDir, "extract.worker.mjs"),
    bundle: true, platform: "node", target: "node20", format: "esm",
    external: ["unpdf", "fflate"], logLevel: "silent",
  });
  built = path.join(outDir, "extract.worker.mjs");
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(path.dirname(built), { recursive: true, force: true });
});

describe("runExtraction: isolation and limits", () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it("returns the worker's result", async () => {
    const f = fake("ok.mjs", `import {parentPort} from "node:worker_threads"; parentPort.postMessage({ok:true,text:"hi",truncated:false});`);
    expect(await runExtraction("text/plain", bytes, { workerFile: f })).toEqual({ ok: true, text: "hi", truncated: false });
  });

  it("a hung worker is terminated at the timeout and reported TIMEOUT", async () => {
    const f = fake("hang.mjs", `while (true) {}`);
    const t0 = Date.now();
    expect(await runExtraction("text/plain", bytes, { workerFile: f, timeoutMs: 300 })).toEqual({ ok: false, code: "TIMEOUT" });
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it("a worker that exhausts its heap is reported MEMORY, not a crash of this process", async () => {
    const f = fake("oom.mjs", `const a = []; while (true) a.push(new Array(1e5).fill("x".repeat(64)));`);
    expect(await runExtraction("text/plain", bytes, { workerFile: f, heapMb: 16, timeoutMs: 15_000 })).toEqual({ ok: false, code: "MEMORY" });
  });

  it("a throwing worker, a silent exit and a missing file are all EXTRACT_FAILED", async () => {
    const boom = fake("boom.mjs", `throw new Error("boom");`);
    const quiet = fake("quiet.mjs", `process.exit(0);`);
    const junk = fake("junk.mjs", `import {parentPort} from "node:worker_threads"; parentPort.postMessage("nope");`);
    for (const f of [boom, quiet, junk, path.join(tmp, "missing.mjs")]) {
      expect(await runExtraction("text/plain", bytes, { workerFile: f, timeoutMs: 5_000 })).toEqual({ ok: false, code: "EXTRACT_FAILED" });
    }
  });

  it("does not detach the caller's buffer", async () => {
    const f = fake("ok2.mjs", `import {parentPort} from "node:worker_threads"; parentPort.postMessage({ok:true,text:"x",truncated:false});`);
    const mine = new Uint8Array([9, 9, 9]);
    await runExtraction("text/plain", mine, { workerFile: f });
    expect(mine.length).toBe(3);
  });
});

describe("runExtraction: the real worker, bundled like production", () => {
  it("extracts a PDF and a DOCX through the thread", async () => {
    const pdf = await runExtraction("application/pdf", makePdf("Through the worker thread"), { workerFile: built, timeoutMs: 30_000 });
    expect(pdf.ok).toBe(true);
    if (pdf.ok) expect(pdf.text).toContain("Through the worker thread");
    const docx = await runExtraction(DOCX_MIME, makeDocx(["Word body text"]), { workerFile: built, timeoutMs: 30_000 });
    expect(docx).toEqual({ ok: true, text: "Word body text", truncated: false });
  });

  it("reports a type mismatch from inside the thread", async () => {
    expect(await runExtraction("application/pdf", PNG_BYTES, { workerFile: built, timeoutMs: 30_000 }))
      .toEqual({ ok: false, code: "TYPE_MISMATCH" });
  });
});
