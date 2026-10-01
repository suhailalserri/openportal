import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, it, expect } from "vitest";

/**
 * P6.3e regression guard. In P6.3c a block of `//` comments was written between two JSX elements in
 * message.tsx. Inside JSX that is TEXT, so the whole comment was printed above every user message. This
 * walks every .tsx under apps/web and fails if a JSX text node contains `//` or `/*`.
 * The kitchen-sink page shows source code on screen on purpose and is skipped.
 */
const WEB_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".next", "e2e"]);
const ALLOWED = new Set(["app/[locale]/dev/kitchen-sink/kitchen-sink-client.tsx"]);

function* tsxFiles(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* tsxFiles(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}

export function findLeakedComments(source: string, fileName = "x.tsx"): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if (n.kind === ts.SyntaxKind.JsxText) {
      const text = n.getText();
      if (text.trim() !== "" && /(^|\s)\/\/|\/\*/.test(text)) {
        found.push(`line ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${text.trim().slice(0, 60)}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe("comments inside JSX", () => {
  it("the detector flags a // comment between two elements and accepts a {/* */} one", () => {
    expect(findLeakedComments("const a = (<div><b/>\n  // oops\n  <i/></div>);")).toHaveLength(1);
    expect(findLeakedComments("const a = (<div><b/>\n  {/* fine */}\n  <i/></div>);")).toHaveLength(0);
    expect(findLeakedComments("const a = <div // fine, inside the tag\n  className=\"x\" />;")).toHaveLength(0);
  });

  it("no .tsx file under apps/web prints a comment as text", () => {
    const bad: string[] = [];
    for (const file of tsxFiles(WEB_ROOT)) {
      const rel = path.relative(WEB_ROOT, file).split(path.sep).join("/");
      if (ALLOWED.has(rel)) continue;
      for (const hit of findLeakedComments(fs.readFileSync(file, "utf8"), file)) bad.push(`${rel} ${hit}`);
    }
    expect(bad).toEqual([]);
  });
});
