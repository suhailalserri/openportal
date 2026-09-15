import * as React from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string | undefined;
  error?: string | undefined;
  hint?:  string | undefined;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, className, children, ...props }, ref) => (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-slate-300">{label}</label>}
      <select
        ref={ref}
        className={cn(
          "w-full bg-[color:var(--bg-base)] border rounded-xl px-4 py-3 text-sm text-slate-50",
          "focus:outline-none transition-colors appearance-none",
          error ? "border-red-500 focus:border-red-500" : "border-slate-700 focus:border-[color:var(--accent-blue)]",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint  && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
);
Select.displayName = "Select";
