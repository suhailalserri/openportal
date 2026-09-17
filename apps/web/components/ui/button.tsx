import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?:    "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }: ButtonProps) {
  const base = cn(
    "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150",
    "focus-visible:outline-none focus-visible:shadow-[var(--shadow-glow-blue)]",
    "active:scale-[0.98]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
  );
  const variants = {
    // The one solid surface in the button set — everything else here
    // is glass, but the primary action (send, redeem, pay) earns a
    // flat, confident fill so it never gets lost against translucent
    // chrome behind it.
    primary:   "bg-[color:var(--accent-blue)] hover:brightness-110 text-white shadow-[var(--shadow-elevation-1)] hover:shadow-[var(--shadow-elevation-2)]",
    secondary: "bg-white/[0.06] hover:bg-white/[0.10] text-slate-100 border border-white/10 backdrop-blur-md",
    outline:   "bg-transparent hover:bg-white/[0.06] text-slate-200 border border-white/15",
    ghost:     "hover:bg-white/[0.06] text-slate-400 hover:text-slate-100",
    danger:    "bg-red-600/90 hover:bg-red-600 text-white border border-red-400/20",
  };
  const sizes = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-4 py-2.5 gap-2",
    lg: "text-base px-6 py-3 gap-2.5",
    // Square icon-only button — the header/toolbar/composer glyph
    // buttons repeated as one-off classes across ChatHeader, InputBar,
    // AccountMenu, etc. now have one canonical size to converge on.
    icon: "h-9 w-9 p-0",
  };

  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="-ms-1 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
