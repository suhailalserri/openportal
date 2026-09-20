"use client";

import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/ui/text-animate.tsx
 *
 * Phase 3.3. Word-by-word blur-fade text, in the style of Magic UI's
 * `TextAnimate` / `BlurFade` (copy-in source, same approach as
 * shimmer-button.tsx — see that file's note on Magic UI).
 *
 * ARABIC-SAFE: it splits on WHITESPACE only (whole words). Never split
 * Arabic into letters — that breaks the joined letter shapes.
 *
 * Plays once when scrolled into view. Reduced motion renders plain text.
 * The full sentence is exposed to screen readers through `aria-label`
 * while the animated word spans are aria-hidden.
 */
interface TextAnimateProps {
  children: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  /** Seconds before the first word. */
  delay?: number;
  /** Seconds between words. */
  stagger?: number;
}

export function TextAnimate({
  children,
  as = "span",
  className,
  delay = 0,
  stagger = 0.06,
}: TextAnimateProps) {
  const reduce = useReducedMotion();
  const Tag = as;
  const words = children.split(/\s+/).filter(Boolean);

  if (reduce) return <Tag className={className}>{children}</Tag>;

  return (
    <Tag className={cn(className)} aria-label={children}>
      {words.map((word, i) => (
        <React.Fragment key={`${word}-${i}`}>
          <motion.span
            aria-hidden
            className="inline-block"
            initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: delay + Math.min(i * stagger, 1.2), ease: "easeOut" }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </Tag>
  );
}
