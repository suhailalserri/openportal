import * as React from "react";
import { ChevronDown } from "lucide-react";
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
      {/* `appearance-none` strips the native arrow on every browser, so a
          chevron has to be supplied — it wasn't, which made every <Select>
          in the app (admin/codes, admin/payment-methods) look like a plain
          text field with no affordance that it opens a list. */}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "w-full bg-[color:var(--bg-base)] border rounded-xl px-4 py-3 pe-10 text-sm text-slate-50",
            "focus:outline-none transition-[border-color,box-shadow] appearance-none",
            error
              ? "border-red-500 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(194,75,58,0.12)]"
              : "border-slate-700 focus:border-[color:var(--accent-blue)] focus:shadow-[var(--ring-accent)]",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 -translate-y-1/2 end-3.5 h-4 w-4 text-slate-500" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint  && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
);
Select.displayName = "Select";
