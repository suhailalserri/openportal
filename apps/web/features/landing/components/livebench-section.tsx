import { Reveal } from "@/components/ui/reveal";

import { LiveBenchEmbed } from "./livebench-embed";

/**
 * apps/web/features/landing/components/livebench-section.tsx
 *
 * Phase 3.3. Placed directly under ModelsSection per the plan
 * ("it sits under our models table"). No server data of its own — the
 * embed itself is fully client-side (load-on-click iframe state).
 */
export function LiveBenchSection() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <Reveal direction="up">
        <LiveBenchEmbed />
      </Reveal>
    </section>
  );
}
