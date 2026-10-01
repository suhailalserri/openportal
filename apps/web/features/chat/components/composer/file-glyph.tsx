import * as React from "react";
import { File, FileCode2, FileSpreadsheet, FileText, Image as ImageIcon, Presentation } from "lucide-react";

import { cn } from "@/lib/utils";
import { fileFamily, type FileFamily } from "../../lib/attach-types";

/**
 * apps/web/features/chat/components/composer/file-glyph.tsx
 *
 * P6.3c. The small coloured file icon from the owner's catalog (Elements2.html, attachment sheet "Recent"
 * rows): one tint per file family so a row of chips reads at a glance. Shared by the composer strip and
 * the chips shown on a sent message.
 */
const TINT: Record<FileFamily, string> = {
  image: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  pdf: "bg-red-500/12 text-red-600 dark:text-red-400",
  word: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  sheet: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  slides: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
  code: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
  text: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
};

const ICON: Record<FileFamily, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  image: ImageIcon, pdf: FileText, word: FileText, sheet: FileSpreadsheet, slides: Presentation, code: FileCode2, text: File,
};

export function FileGlyph({
  name, kind, className,
}: { name: string; kind: "image" | "document"; className?: string | undefined }) {
  const family = fileFamily(name, kind);
  const Icon = ICON[family];
  return (
    <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TINT[family], className)}>
      <Icon aria-hidden className="size-4" />
    </span>
  );
}
