"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Camera, ChevronRight, FileUp, Image as ImageIcon } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { FILE_PICKER_ACCEPT, PHOTO_PICKER_ACCEPT } from "../../lib/attach-types";

/**
 * apps/web/features/chat/components/composer/attachment-sheet.tsx
 *
 * P6.3c. The attachment sheet, ported from the owner's catalog (Elements2.html "19 · Attachment Sheet"):
 * a bottom sheet with a grabber, a title and subtitle, two large tiles (Camera, Photos) and a "Choose a
 * file" row, then the limits as a quiet footnote.
 *
 * Deliberately NOT drawn from the catalog (the backend has nothing behind them): the "Recent" file list,
 * the URL / Code / Drive paste row, and the "CSV, ZIP up to 20 MB" copy (archives are refused; the real
 * accepted list is in lib/attach-types.ts). The Camera tile shows only on touch devices (`capture` does
 * nothing on a desktop browser). Each tile is a real <input type=file> behind a <label>-like button, so
 * the OS picker opens from a genuine user gesture on every browser.
 */
export interface AttachmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFiles: (files: File[]) => void;
}

function Tile({
  icon, title, hint, onClick,
}: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-background p-4 text-start outline-none transition-[background-color,transform] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transition-none"
    >
      <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">{icon}</span>
      <span>
        <span className="block text-[14px] font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[12px] text-faint-foreground">{hint}</span>
      </span>
    </button>
  );
}

export function AttachmentSheet({ open, onOpenChange, onFiles }: AttachmentSheetProps) {
  const t = useTranslations("chat");
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const photosRef = React.useRef<HTMLInputElement>(null);
  const filesRef = React.useRef<HTMLInputElement>(null);
  const [touch, setTouch] = React.useState(false);

  React.useEffect(() => {
    setTouch(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true);
  }, []);

  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // the same file can be picked again after removing it
    if (files.length > 0) onFiles(files);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto w-full max-w-lg gap-0 rounded-t-[22px] border-border px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2"
      >
        <span aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" />
        <SheetHeader className="p-0 pb-4 text-start">
          <SheetTitle className="text-[17px] font-semibold">{t("attachTitle")}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">{t("attachSubtitle")}</SheetDescription>
        </SheetHeader>

        <div className={cn("grid gap-3", touch ? "grid-cols-2" : "grid-cols-1")}>
          {touch && (
            <Tile icon={<Camera aria-hidden className="size-5" />} title={t("attachCamera")} hint={t("attachCameraHint")} onClick={() => cameraRef.current?.click()} />
          )}
          <Tile icon={<ImageIcon aria-hidden className="size-5" />} title={t("attachPhotos")} hint={t("attachPhotosHint")} onClick={() => photosRef.current?.click()} />
        </div>

        <button
          type="button"
          onClick={() => filesRef.current?.click()}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3.5 text-start outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <FileUp aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-foreground">{t("attachFile")}</span>
            <span className="mt-0.5 block text-[12px] text-faint-foreground">{t("attachFileHint")}</span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-faint-foreground rtl:rotate-180" />
        </button>

        <p className="mt-4 text-center text-[11.5px] text-faint-foreground">{t("attachLimits")}</p>

        {/* Hidden pickers. `capture` opens the camera directly on phones. */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} tabIndex={-1} aria-hidden />
        <input ref={photosRef} type="file" accept={PHOTO_PICKER_ACCEPT} multiple className="hidden" onChange={picked} tabIndex={-1} aria-hidden />
        <input ref={filesRef} type="file" accept={FILE_PICKER_ACCEPT} multiple className="hidden" onChange={picked} tabIndex={-1} aria-hidden />
      </SheetContent>
    </Sheet>
  );
}
