"use client";

import { Toaster } from "sonner";
import { useLocale } from "next-intl";

const RTL_LOCALES = new Set(["ar"]);

/**
 * Previously inlined in layout.tsx, pointed at --bg-surface/--text-primary
 * — tokens that don't exist in theme.css (Gateway uses
 * --popover/--popover-foreground/--border). Fixed and given its own file
 * per the plan's providers/ split (Session 1.2).
 *
 * Restyled (Session "restyle") against `.toast-region` / `.toast` /
 * `.toast.success/.danger/.info/.warning` in the theme HTML. This
 * replaces a since-deleted duplicate that briefly lived at
 * `components/ui/toast-provider.tsx` and exported the same
 * `AppToastProvider` name — that copy was never imported by
 * `app/[locale]/layout.tsx` (which has always pointed here), so its
 * restyled classes were dead code; folded into the real file instead of
 * shipping two toast providers.
 *
 * Position deviation (deliberate): the source centers toasts at the
 * bottom (`inset-inline: 0; align-items: center`) in BOTH directions —
 * it does not mirror to a bottom corner per RTL/LTR. Sonner's
 * "bottom-center" already does exactly this without any RTL branching,
 * so the previous bottom-left/bottom-right split is removed; `dir` is
 * kept so text inside each toast still reads the right direction.
 *
 * The source's colored leading dot (`.toast .dot`) has no equivalent
 * Sonner prop that applies globally without wrapping every `toast()`
 * call, so it's approximated as a 3px colored `border-inline-start` per
 * type instead — same "which kind of toast is this at a glance" job,
 * not pixel-identical. Revisit if a later phase wraps `toast()` in a
 * shared helper that can pass a per-call icon/dot.
 */
export function AppToastProvider() {
  const locale = useLocale();
  const isRTL = RTL_LOCALES.has(locale);

  return (
    <Toaster
      position="bottom-center"
      dir={isRTL ? "rtl" : "ltr"}
      toastOptions={{
        style: {
          background: "var(--card)",
          color: "var(--card-foreground)",
          border: "1px solid var(--input)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-2)",
          fontSize: "13.5px",
          minWidth: "240px",
          maxWidth: "420px",
          padding: "11px 14px",
        },
        classNames: {
          success: "!border-s-[3px] !border-s-success",
          error: "!border-s-[3px] !border-s-destructive",
          warning: "!border-s-[3px] !border-s-accent-foreground",
          info: "!border-s-[3px] !border-s-accent-foreground",
        },
      }}
    />
  );
}
