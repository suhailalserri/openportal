import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:  string;
  error?:  string;
  hint?:   string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-slate-300">{label}</label>}
      <input
        ref={ref}
        className={cn(
          "w-full bg-[#0F172A] border rounded-xl px-4 py-3 text-sm text-white",
          "placeholder-slate-500 focus:outline-none transition-colors",
          error ? "border-red-500 focus:border-red-500" : "border-slate-600 focus:border-blue-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint  && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
);
Input.displayName = "Input";
