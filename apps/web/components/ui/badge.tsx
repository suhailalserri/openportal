import { cn } from "@/lib/utils";

interface BadgeProps { children: React.ReactNode; variant?: "default" | "success" | "warning" | "error" | "blue"; className?: string }

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    default: "bg-slate-700 text-slate-300",
    success: "bg-emerald-900/40 text-emerald-400 border border-emerald-800",
    warning: "bg-amber-900/40 text-amber-400 border border-amber-800",
    error:   "bg-red-900/40 text-red-400 border border-red-800",
    blue:    "bg-blue-900/40 text-blue-400 border border-blue-800",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", variants[variant], className)}>
      {children}
    </span>
  );
}
