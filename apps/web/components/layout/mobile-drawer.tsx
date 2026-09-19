"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { SidebarNav } from "./app-sidebar";

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string | null;
}

/**
 * Controlled Sheet opened from the shell's header button. It contains
 * Radix context-dependent pieces (SheetClose → DialogClose), so per
 * Rule 3 the parent renders it ONLY when `useIsMobile()` is true —
 * never hidden with CSS. That is exactly the `DialogClose must be used
 * within Dialog` crash the rule exists to prevent.
 *
 * side="start": docks to the leading edge (right in Arabic, left in
 * English); sheet.tsx picks the matching slide animation from the
 * ambient Radix direction.
 */
export function MobileDrawer({ open, onOpenChange, role }: MobileDrawerProps) {
  const t = useTranslations("shell");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="start"
        // Own close button below (translated label); the built-in one is
        // hard-coded English.
        showCloseButton={false}
        // No description — opt out of Radix's missing-description warning.
        aria-describedby={undefined}
        className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b border-sidebar-border p-3">
          <SheetTitle>{t("menuTitle")}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={t("closeMenu")}>
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>
        <SidebarNav role={role} onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
