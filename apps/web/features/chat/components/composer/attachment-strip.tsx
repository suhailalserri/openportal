"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatBytes } from "../../lib/attach-types";
import type { AttachItem } from "../../lib/attachments-state";
import { FileGlyph } from "./file-glyph";

/**
 * apps/web/features/chat/components/composer/attachment-strip.tsx
 *
 * P6.3c. The files attached to the message being written: a horizontally scrolling row of chips above
 * the text box, each showing its coloured file icon, name, size and live state (uploading, reading,
 * ready, or the reason it failed) with a remove button. Styling follows the owner's catalog
 * (Elements2.html, attachment sheet rows): quiet surface, hairline border, small coloured file tile.
 * Motion: only the spinner, behind `motion-safe:`.
 */
export interface AttachmentStripProps {
  items: AttachItem[];
  onRemove: (localId: string) => void;
  className?: string | undefined;
}

export function AttachmentStrip({ items, onRemove, className }: AttachmentStripProps) {
  const t = useTranslations("chat");
  if (items.length === 0) return null;

  return (
    <ul
      aria-label={t("attachFilesLabel")}
      className={cn("-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]", className)}
    >
      {items.map((item) => {
        const failed = item.status === "error";
        return (
          <li
            key={item.localId}
            className={cn(
              "flex min-w-0 max-w-[15rem] shrink-0 items-center gap-2.5 rounded-xl border bg-secondary py-1.5 ps-1.5 pe-1 transition-colors",
              failed ? "border-destructive/50" : "border-border",
            )}
          >
            <FileGlyph name={item.fileName} kind={item.kind} />
            <div className="min-w-0 flex-1">
              <p dir="auto" className="truncate text-[12.5px] font-medium leading-tight text-foreground">{item.fileName}</p>
              <p
                className={cn(
                  "mt-0.5 flex min-w-0 items-center gap-1 text-[11.5px] leading-tight",
                  failed ? "text-destructive" : "text-faint-foreground",
                )}
              >
                {item.status === "uploading" && (
                  <>
                    <Loader2 aria-hidden className="size-3 shrink-0 motion-safe:animate-spin" />
                    <span className="truncate">{item.stage === "reading" ? t("attachReading") : t("attachUploading")}</span>
                  </>
                )}
                {item.status === "ready" && (
                  <>
                    <Check aria-hidden className="size-3 shrink-0 text-primary" />
                    <span className="truncate" title={item.truncated ? t("attachTrimmed") : undefined}>
                      {formatBytes(item.sizeBytes)}
                      {item.truncated ? ` · ${t("attachTrimmedShort")}` : ""}
                    </span>
                  </>
                )}
                {failed && (
                  <>
                    <AlertCircle aria-hidden className="size-3 shrink-0" />
                    <span className="line-clamp-2 whitespace-normal" role="alert">{item.errorKey ? t(item.errorKey) : t("attachErrGeneric")}</span>
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.localId)}
              aria-label={t("attachRemove", { name: item.fileName })}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-faint-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
