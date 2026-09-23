import { Reveal } from "@/components/ui/reveal";
import { getDemoContent } from "@/features/landing/lib/get-demo-content";

import { DemoSection } from "./demo-section";

/**
 * apps/web/features/landing/components/demo-section-wrapper.tsx
 *
 * Phase 3.3. Reads content/demo/simulated-chat.json server-side
 * (get-demo-content.ts) and renders nothing at all when it's missing or
 * malformed (parseDemoContent's fail-closed null) — "the demo section
 * stays hidden" until real (or, for now, clearly-labelled simulated)
 * content exists. This is a Server Component specifically so the
 * hide/show decision happens before any client JS ships for this
 * section at all.
 */
export function DemoSectionWrapper({ locale }: { locale: string }) {
  const content = getDemoContent();
  if (!content) return null;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <DemoSection locale={locale} content={content} />
      </Reveal>
    </section>
  );
}