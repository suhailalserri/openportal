import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?:    "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }: ButtonProps) {
  const base = cn(
    "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150",
    "focus-visible:outline-none focus-visible:shadow-[var(--shadow-glow-blue)]",
    "active:scale-[0.98]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
  );
  const variants = {
    // Gradient + elevation shadow instead of a flat fill — this is the
    // one button people click most (send, redeem, pay), so it's the one
    // worth the extra visual weight.
    primary:   "gradient-primary text-white shadow-[var(--shadow-elevation-2)] hover:shadow-[var(--shadow-elevation-3)]",
    secondary: "bg-slate-700 hover:bg-slate-600 text-white border border-slate-600",
    ghost:     "hover:bg-slate-800 text-slate-300 hover:text-white",
    danger:    "bg-red-600 hover:bg-red-700 text-white",
  };
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2.5", lg: "text-base px-6 py-3" };

  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="-ms-1 me-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
