import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/shimmer-button.tsx
 *
 * Magic UI "Shimmer Button" —
 * https://magicui.design/docs/components/shimmer-button (MIT, © Magic UI;
 * credit to @jh3yy for the original idea). Copied from
 * `https://magicui.design/r/shimmer-button.json`. The `shimmer-slide` /
 * `spin-around` keyframes and their `animate-*` theme entries live in
 * styles/index.css.
 *
 * ONE ADDITION: `asChild`. The original always renders a <button>, but
 * the landing page needs the same look on a <Link> (a link inside a
 * button is invalid HTML). With `asChild`, the spark / highlight /
 * backdrop layers are placed INSIDE the caller's single element and Radix
 * Slot receives that one element (Slot throws "failed to slot onto its
 * children" if it is given more than one).
 */

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
  asChild?: boolean;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "#ffffff",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "100px",
      background = "rgba(0, 0, 0, 1)",
      className,
      children,
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const style = {
      "--spread": "90deg",
      "--shimmer-color": shimmerColor,
      "--radius": borderRadius,
      "--speed": shimmerDuration,
      "--cut": shimmerSize,
      "--bg": background,
    } as CSSProperties;

    const classes = cn(
      "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden [border-radius:var(--radius)] border border-white/10 px-6 py-3 whitespace-nowrap text-white [background:var(--bg)]",
      "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    );

    const spark = (
      <div key="spark" className={cn("-z-30 blur-[2px]", "@container-[size] absolute inset-0 overflow-visible")}>
        {/* spark */}
        <div className="animate-shimmer-slide absolute inset-0 aspect-[1] h-[100cqh] rounded-none [mask:none]">
          {/* spark before */}
          <div className="animate-spin-around absolute -inset-full w-auto [translate:0_0] rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
        </div>
      </div>
    );

    const highlight = (
      <div
        key="highlight"
        className={cn(
          "absolute inset-0 size-full",
          "rounded-2xl px-4 py-1.5 text-sm font-medium shadow-[inset_0_-8px_10px_#ffffff1f]",
          // transition
          "transform-gpu transition-all duration-300 ease-in-out",
          // on hover
          "group-hover:shadow-[inset_0_-6px_10px_#ffffff3f]",
          // on click
          "group-active:shadow-[inset_0_-10px_10px_#ffffff3f]",
        )}
      />
    );

    const backdrop = (
      <div
        key="backdrop"
        className={cn("absolute inset-(--cut) -z-20 [border-radius:var(--radius)] [background:var(--bg)]")}
      />
    );

    if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children)) {
      return (
        <Slot className={classes} style={style} {...(props as object)}>
          {React.cloneElement(children, undefined, spark, children.props.children, highlight, backdrop)}
        </Slot>
      );
    }

    return (
      <button style={style} className={classes} ref={ref} {...props}>
        {spark}
        {children}
        {highlight}
        {backdrop}
      </button>
    );
  },
);

ShimmerButton.displayName = "ShimmerButton";
