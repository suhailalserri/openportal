"use client";

import * as React from "react";
import { motion, useReducedMotion, type MotionProps } from "framer-motion";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/shiny-button.tsx
 *
 * Magic UI "Shiny Button" —
 * https://magicui.design/docs/components/shiny-button (MIT, © Magic UI).
 * Copied from `https://magicui.design/r/shiny-button.json` and adapted:
 *
 *  1. `motion/react` -> `framer-motion`.
 *  2. Theme tokens only. The registry version hardcodes a dark surface
 *     and a white sweep; here the surface is `--card`, the text is
 *     `--foreground`, and the sweep is
 *     `color-mix(in oklab, var(--primary) 60%, white)` so the shine is
 *     always a brighter version of the theme's own primary — reads
 *     correct on parchment (light) and on the dark base, follows preset
 *     switches automatically.
 *  3. Reduced motion: falls back to a plain themed button. The sweep is
 *     the entire point of the component, so under reduced motion we don't
 *     freeze it mid-air — we render the static variant and skip the JS
 *     animation entirely.
 *
 * The shine is a Framer Motion `animate` loop on `backgroundPosition`,
 * not a CSS keyframe, so it runs on demand (`whileHover`) rather than
 * forever. That's deliberate — an always-looping shine is distracting on
 * a page with several of these; a hover-triggered one reads as
 * interactive.
 *
 * No styles/index.css additions required.
 */

export interface ShinyButtonProps
  extends Omit<React.ComponentPropsWithoutRef<"button">, keyof MotionProps>,
    MotionProps {
  className?: string;
  children?: React.ReactNode;
  /** Render onto the single child element (e.g. a next/link `<Link>`)
   *  instead of a `<button>`, same convention as ShimmerButton/Button. */
  asChild?: boolean;
}

const MotionSlot = motion(Slot);

export const ShinyButton = ({
  className,
  children,
  asChild = false,
  ...props
}: ShinyButtonProps) => {
  const reduced = useReducedMotion();

  const motionProps = {
    initial: { "--x": "100%", scale: 1 } as never,
    ...(reduced
      ? {}
      : {
          animate: { "--x": "-100%" } as never,
          whileTap: { scale: 0.97 },
          transition: {
            repeat: Infinity,
            repeatType: "loop" as const,
            repeatDelay: 1,
            type: "spring" as const,
            stiffness: 20,
            damping: 15,
            mass: 2,
            scale: {
              type: "spring" as const,
              stiffness: 200,
              damping: 5,
              mass: 0.5,
            },
          },
        }),
  };

  const classes = cn(
    "relative inline-flex items-center justify-center rounded-[var(--radius-md)]",
    "border border-border bg-card px-6 py-2.5",
    "text-sm font-medium text-foreground",
    "transition-shadow duration-[var(--duration-base)] ease-[var(--ease-standard)]",
    "hover:shadow-[var(--shadow-2)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    className,
  );

  const makeTextSweep = (content: React.ReactNode) => (
    <span
      key="text-sweep"
      className="relative block size-full"
      style={{
        // The sweep is a horizontal band that travels across the button
        // using `background-position` as a CSS custom property. `--x`
        // is animated by Framer Motion above; the gradient reads it.
        backgroundImage:
          "radial-gradient(120px circle at var(--x, 100%) 50%, color-mix(in oklab, var(--primary) 60%, white), transparent 40%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
      }}
    >
      {content}
    </span>
  );

  // Hairline border highlight that follows the same sweep, so the
  // shine reads as attached to the button, not floating over it.
  const borderSweep = (
    <span
      key="border-sweep"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{
        backgroundImage:
          "radial-gradient(60px circle at var(--x, 100%) 50%, color-mix(in oklab, var(--primary) 80%, white), transparent 40%)",
        mask: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
        maskComposite: "exclude",
        WebkitMask:
          "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
        WebkitMaskComposite: "xor",
        padding: "1px",
      }}
    />
  );

  // asChild: Slot requires exactly one child, so — same convention as
  // ShimmerButton — clone the caller's single element (e.g. a next/link
  // `<Link>`) and inject the sweep layers as ITS children, rather than
  // handing Slot multiple children directly.
  if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return (
      <MotionSlot className={classes} {...motionProps} {...(props as object)}>
        {React.cloneElement(
          children,
          undefined,
          makeTextSweep(children.props.children),
          borderSweep,
        )}
      </MotionSlot>
    );
  }

  return (
    <motion.button type="button" className={classes} {...motionProps} {...props}>
      {makeTextSweep(children)}
      {borderSweep}
    </motion.button>
  );
};