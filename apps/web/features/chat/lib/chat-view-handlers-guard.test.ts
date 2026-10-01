import fs from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, it, expect } from "vitest";

/**
 * P6.3f regression guard. In chat-view.tsx `useCallback(..., [stream])` made the Regenerate and Edit
 * handlers change on EVERY render (`stream` is a fresh object each time), which defeated React.memo on
 * every message row: each keystroke and each streamed frame re-parsed all messages as markdown. Handlers
 * must read `stream` through a ref instead. This fails if a useCallback/useMemo in chat-view.tsx lists
 * the whole `stream` object as a dependency.
 */
export function findStreamDeps(source: string): string[] {
  const sf = ts.createSourceFile("chat-view.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText();
      if (/(^|\.)(useCallback|useMemo)$/.test(callee)) {
        const deps = n.arguments[1];
        if (deps && ts.isArrayLiteralExpression(deps)) {
          for (const el of deps.elements) {
            if (ts.isIdentifier(el) && el.text === "stream") {
              found.push(`line ${sf.getLineAndCharacterOfPosition(el.getStart()).line + 1}`);
            }
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe("chat-view handler stability", () => {
  it("the detector flags [stream] and accepts a ref-based handler", () => {
    expect(findStreamDeps("const a = React.useCallback(() => stream.retry(), [stream]);")).toHaveLength(1);
    expect(findStreamDeps("const a = useMemo(() => 1, [stream]);")).toHaveLength(1);
    expect(findStreamDeps("const a = React.useCallback(() => streamRef.current.retry(), []);")).toHaveLength(0);
    expect(findStreamDeps("const a = React.useCallback(() => 1, [stream.status]);")).toHaveLength(0);
  });

  it("chat-view.tsx has no hook that depends on the whole stream object", () => {
    const file = fileURLToPath(new URL("../components/chat-view.tsx", import.meta.url));
    expect(findStreamDeps(fs.readFileSync(file, "utf8"))).toEqual([]);
  });
});
