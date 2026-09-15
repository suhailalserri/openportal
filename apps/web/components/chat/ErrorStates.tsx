"use client";
import { useTranslations } from "next-intl";
import { WifiOff, FolderOpen, TriangleAlert } from "lucide-react";

// EDGE CASE 6 (Phase 14.1): network offline detection.
export function OfflineBanner({ locale }: { locale: string }) {
  const t = useTranslations();
  void locale;
  return (
    <div className="status-error border-b border-red-500/20 px-4 py-2 text-center animate-fade-in">
      <p className="flex items-center justify-center gap-1.5 text-sm">
        <WifiOff className="h-4 w-4 shrink-0" />
        {t("chat.offline")}
      </p>
    </div>
  );
}

// EDGE CASE 4 (Phase 14.1): same conversation open in another browser tab.
export function TabConflictBanner({ sending }: { sending: boolean }) {
  const t = useTranslations();
  return (
    <div className="status-warning border-b border-amber-500/20 px-4 py-2 text-center animate-fade-in">
      <p className="flex items-center justify-center gap-1.5 text-sm">
        <FolderOpen className="h-4 w-4 shrink-0" />
        {sending ? t("chat.tabConflictSending") : t("chat.tabConflict")}
      </p>
    </div>
  );
}

interface StreamErrorBannerProps {
  message:  string;
  onRetry?: () => void;
  locale:   string;
}

// EDGE CASE 7 (Phase 14.1): stream interrupted / any other request-level
// failure the chat page surfaces beyond the toast, with a clear retry path.
export function StreamErrorBanner({ message, onRetry, locale }: StreamErrorBannerProps) {
  const t = useTranslations();
  const isRTL = locale === "ar";
  return (
    <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl border
                    border-red-500/30 bg-red-500/10 px-4 py-3 animate-fade-in
                    shadow-[var(--shadow-elevation-1)]">
      <p className="flex items-center gap-1.5 text-sm text-red-300">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs
                     text-red-200 hover:bg-red-500/20 active:scale-95 transition-all"
        >
          {isRTL ? "إعادة المحاولة" : t("chat.regenerate")}
        </button>
      )}
    </div>
  );
}
