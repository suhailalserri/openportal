import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** One line of the live password-rule checklist (register + reset pages). */
export function PasswordRuleRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-1.5", ok ? "text-success" : "text-muted-foreground")}>
      {ok ? <Check aria-hidden="true" className="size-3.5" /> : <X aria-hidden="true" className="size-3.5" />}
      {label}
    </li>
  );
}
