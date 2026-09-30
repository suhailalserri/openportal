/**
 * P3.5 — "logs contain no message content or tokens".
 *
 * 1. The scanner itself is tested on fixtures (so this cannot pass vacuously).
 * 2. Every non-test source file under apps/api/src is scanned. A finding fails
 *    the build: either remove the value from the log call, or, if it has been
 *    reviewed and is safe, mark the call line with `// log-ok: <reason>`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { scanSourceForLogLeaks } from "./log-scan";

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test" ? [] : sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

describe("scanner fixtures", () => {
  const leaks = [
    "console.log(req.body)",
    'app.log.info({ messages }, "x")',
    "console.warn(`user said ${msg.content}`)",
    "req.log.error({ headers: req.headers })",
    "logger.error(headers.authorization)",
    'console.error("failed", sessionToken)',
    "console.log(JSON.stringify(body))",
    'app.log.warn({ err: e.message, INTERNAL_SERVICE_TOKEN }, "boom")',
    'console.log(\n  "multi",\n  streamedContent,\n)',
    "console.log(`nested ${ fn(`inner ${apiKey}`) }`)",
  ];
  const clean = [
    'console.log("token expired for messages in the body")',
    "console.log(inputTokens, outputTokens, maxTokens)",
    "app.log.error({ path, err: error.message }, 'tRPC error')",
    'console.error("[metrics] redis error:", err.message)',
    "console.log(`API running on :${config.PORT} [${config.NODE_ENV}]`)",
    "console.log(req.body) // log-ok: reviewed, dev only",
    "// console.log(req.body)\nconst x = 1",
    "const messageQueue = 1; console.log(messageQueue)",
  ];
  it.each(leaks)("flags: %s", (src) => { expect(scanSourceForLogLeaks(src)).toHaveLength(1); });
  it.each(clean)("allows: %s", (src) => { expect(scanSourceForLogLeaks(src)).toHaveLength(0); });
});

describe("apps/api/src", () => {
  const files = sourceFiles(SRC_ROOT);

  it("scans a realistic number of files", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("no log call carries message content, request bodies, headers or credentials", () => {
    const findings = files.flatMap((file) =>
      scanSourceForLogLeaks(readFileSync(file, "utf8")).map(
        (f) => `${relative(SRC_ROOT, file)}:${f.line}  ${f.call}(... ${f.identifier} ...)`,
      ),
    );
    expect(findings, `Log call(s) reference sensitive values:\n${findings.join("\n")}`).toEqual([]);
  });
});
