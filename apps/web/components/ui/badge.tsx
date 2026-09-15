import { cn } from "@/lib/utils";

interface BadgeProps { children: React.ReactNode; variant?: "default" | "success" | "warning" | "error" | "blue"; className?: string }

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    default: "bg-slate-800 text-slate-300 border border-slate-700",
    success: "bg-emerald-900/40 text-emerald-400 border border-emerald-800",
    warning: "bg-amber-900/40 text-amber-400 border border-amber-800",
    error:   "bg-red-900/40 text-red-400 border border-red-800",
    blue:    "bg-[color:var(--accent-blue)]/15 text-[color:var(--accent-blue-light)] border border-[color:var(--accent-blue)]/30",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", variants[variant], className)}>
      {children}
    </span>
  );
}
