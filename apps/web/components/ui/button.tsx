import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?:    "sm" | "md" | "lg";
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
    // Flat, confident clay — the one action people take most (send,
    // redeem, pay). No gradient theatrics; the weight comes from color
    // and a quiet shadow, not a shine effect.
    primary:   "bg-[color:var(--accent-blue)] hover:brightness-110 text-white shadow-[var(--shadow-elevation-1)] hover:shadow-[var(--shadow-elevation-2)]",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700",
    outline:   "bg-transparent hover:bg-slate-800 text-slate-200 border border-slate-700",
    ghost:     "hover:bg-slate-800 text-slate-400 hover:text-slate-100",
    danger:    "bg-red-600 hover:bg-red-700 text-white",
  };
  const sizes = { sm: "text-xs px-3 py-1.5 gap-1.5", md: "text-sm px-4 py-2.5 gap-2", lg: "text-base px-6 py-3 gap-2.5" };

  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="-ms-1 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
