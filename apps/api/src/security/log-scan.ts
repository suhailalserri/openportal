/**
 * P3.5 (closes N6, "logs contain no message content or tokens").
 *
 * A small static scanner used by log-hygiene.test.ts. It finds logging calls
 * (console.*, app.log.*, req.log.*, logger.*, log.*) in api source and flags any
 * whose ARGUMENTS reference something that carries message content or a
 * credential: `messages`, `content`, `prompt`, `body`, `headers`, or an
 * identifier ending in token / secret / password / apiKey / authorization /
 * cookie / bearer (token COUNTS such as `inputTokens` are fine: plural).
 *
 * String literals are ignored (so "token expired" is fine); template `${...}`
 * expressions are inspected. A reviewed exception is marked with a
 * `// log-ok: <reason>` comment on the line of the call.
 *
 * It is a tripwire for regressions, not a proof: it cannot see a value that is
 * renamed on the way into a log call. The runtime redaction in plugins.ts is the
 * second layer.
 */

export interface LogFinding {
  line: number;
  call: string;
  identifier: string;
}

const CALL_START =
  /\b(?:console\.(?:log|info|warn|error|debug|trace)|(?:[A-Za-z_$][\w$]*\.)?log\.(?:trace|debug|info|warn|error|fatal)|logger\.(?:trace|debug|info|warn|error|fatal))\s*\(/g;

const EXACT_FORBIDDEN = new Set([
  "messages", "content", "prompt", "systemprompt", "body", "headers",
  "streamedcontent", "usermessage", "usercontent",
]);
const SUFFIX_FORBIDDEN = ["token", "secret", "password", "passwd", "apikey", "authorization", "cookie", "cookies", "bearer"];

function isForbidden(identifier: string): boolean {
  const id = identifier.replace(/_/g, "").toLowerCase();
  if (EXACT_FORBIDDEN.has(id)) return true;
  return SUFFIX_FORBIDDEN.some((s) => id === s || id.endsWith(s));
}

/**
 * Returns the argument text of the call starting at `open` (index of "("),
 * with string-literal contents and comments blanked out but `${...}` template
 * expressions kept, plus the index just past the closing ")".
 */
function readArgs(src: string, open: number): { code: string; end: number } {
  let depth = 0;
  let out = "";
  let i = open;
  const readTemplate = (): void => {
    // src[i] === "`"
    i++;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        let d = 1;
        out += " ";
        while (i < src.length && d > 0) {
          const c = src[i]!;
          if (c === "`") { readTemplate(); continue; }
          if (c === "'" || c === '"') { skipQuoted(c); continue; }
          if (c === "{") d++;
          if (c === "}") { d--; if (d === 0) { i++; break; } }
          out += c;
          i++;
        }
        out += " ";
        continue;
      }
      i++;
    }
    i++; // closing backtick
  };
  const skipQuoted = (q: string): void => {
    i++;
    while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
    i++;
    out += " ";
  };
  while (i < src.length) {
    const c = src[i]!;
    if (c === "(") { depth++; out += c; i++; continue; }
    if (c === ")") { depth--; out += c; i++; if (depth === 0) break; continue; }
    if (c === "'" || c === '"') { skipQuoted(c); continue; }
    if (c === "`") { readTemplate(); continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e === -1 ? src.length : e + 2; continue; }
    out += c;
    i++;
  }
  return { code: out, end: i };
}

export function scanSourceForLogLeaks(source: string): LogFinding[] {
  const findings: LogFinding[] = [];
  const lines = source.split("\n");
  CALL_START.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALL_START.exec(source)) !== null) {
    const open = m.index + m[0].length - 1;
    const line = source.slice(0, m.index).split("\n").length;
    const lineText = lines[line - 1] ?? "";
    if (/\/\/\s*log-ok:/.test(lineText)) continue;
    // A call that only appears inside a comment (// ..., /* ..., or a JSDoc " * ..." line).
    const before = lineText.slice(0, m.index - source.lastIndexOf("\n", m.index - 1) - 1).trimStart();
    if (before.startsWith("//") || before.startsWith("*") || before.startsWith("/*") || before.includes("//")) continue;
    const { code } = readArgs(source, open);
    for (const idMatch of code.matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (isForbidden(idMatch[0])) {
        findings.push({ line, call: m[0].replace(/\s*\($/, ""), identifier: idMatch[0] });
        break;
      }
    }
  }
  return findings;
}
