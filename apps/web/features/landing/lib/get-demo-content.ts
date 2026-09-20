/**
 * apps/web/features/landing/lib/get-demo-content.ts
 *
 * Phase 3.3. Statically imports content/demo/simulated-chat.json (per
 * demo-content.ts's own doc: "it is imported at build time, so a syntax
 * error would fail `next build`" — a static `import`, not
 * `readFileSync`, is the deliberate choice here, unlike
 * features/legal/lib/read-doc.ts's runtime file read, because a
 * malformed demo file should be caught by CI, not discovered by a
 * visitor). `resolveJsonModule` is already enabled in tsconfig.base.json.
 *
 * The raw import is then run through parseDemoContent, which is a real
 * runtime shape check on top of the static import — a JSON file that is
 * syntactically valid but has, say, a missing field would otherwise
 * silently produce `undefined`s deep in a component; this guards that
 * and fails closed to `null` (section does not render) instead.
 */

import rawDemoContent from "@/content/demo/simulated-chat.json";

import { parseDemoContent, type DemoContent } from "./demo-content";

export function getDemoContent(): DemoContent | null {
  return parseDemoContent(rawDemoContent);
}
