import { cn } from "@/lib/utils";

/**
 * The 🎉 celebration mark shown when a welcome bonus is claimed: a big emoji
 * that pops in with an overshoot then wiggles (`.animate-party-pop` in
 * styles/index.css, disabled under prefers-reduced-motion), flanked by two
 * smaller sparkles on a delay. Decorative — aria-hidden, the text next to
 * it carries the meaning.
 */
export function PartyBurst({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto flex h-16 w-24 items-center justify-center", className)} aria-hidden="true">
      <span className="animate-party-pop text-5xl leading-none">🎉</span>
      <span
        className="animate-party-pop absolute -top-1 start-1 text-xl leading-none"
        style={{ animationDelay: "0.15s" }}
      >
        ✨
      </span>
      <span
        className="animate-party-pop absolute bottom-0 end-1 text-xl leading-none"
        style={{ animationDelay: "0.3s" }}
      >
        🎊
      </span>
    </div>
  );
}
