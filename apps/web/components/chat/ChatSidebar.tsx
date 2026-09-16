"use client";
import { useState, useRef, useEffect } from "react";
import { useTranslations }   from "next-intl";
import Link                  from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X, SquarePen, Settings, ShieldCheck, MoreHorizontal,
  Pencil, Pin, PinOff, Trash2, Check,
} from "lucide-react";
import { BalanceWidget }     from "../shared/BalanceWidget";
import { AccountMenu }       from "../shared/AccountMenu";
import { LanguageSwitcher }  from "../shared/LanguageSwitcher";
import { useConversations, type ConversationSummary } from "@/hooks/useConversations";
import { Skeleton }          from "../ui/skeleton";
import { formatRelativeDate, cn } from "@/lib/utils";
import { trpc }               from "@/lib/trpc";
import { useSession }        from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface Props { locale: string; isOpen: boolean; onClose: () => void }

function ConversationItem({
  conv, locale, isActive, onRename, onTogglePin, onDelete,
}: {
  conv:        ConversationSummary;
  locale:      string;
  isActive:    boolean;
  onRename:    (id: string, title: string) => Promise<boolean>;
  onTogglePin: (id: string, isPinned: boolean) => Promise<boolean>;
  onDelete:    (id: string) => Promise<boolean>;
}) {
  const t = useTranslations();
  const { data: modelList = [] } = trpc.models.list.useQuery();
  const model = modelList.find(m => m.id === conv.modelId);

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft]       = useState(conv.title ?? t("chat.newChat"));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [renaming]);

  async function commitRename() {
    setRenaming(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === (conv.title ?? t("chat.newChat"))) {
      setDraft(conv.title ?? t("chat.newChat"));
      return;
    }
    const ok = await onRename(conv.id, trimmed);
    if (!ok) toast.error(t("errors.generic"));
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setDraft(conv.title ?? t("chat.newChat")); setRenaming(false); }
          }}
          onBlur={commitRename}
          className="flex-1 min-w-0 bg-[color:var(--bg-base)] border border-[color:var(--accent-blue)]
                     rounded-lg px-2 py-1 text-sm text-slate-50 focus:outline-none"
        />
        <button onClick={commitRename} className="shrink-0 text-[color:var(--accent-blue)] p-1" aria-label={t("common.confirm")}>
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="group relative">
      <Link href={`/${locale}/chat/${conv.id}`}
        className={cn(
          "block px-3 py-2.5 pe-9 rounded-xl text-sm transition-colors",
          isActive
            ? "bg-[color:var(--accent-blue)]/12 border border-[color:var(--accent-blue)]/30 text-slate-50"
            : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
        )}>
        <div className="flex items-center gap-2 mb-0.5">
          {model && <span className="text-xs">{model.badge}</span>}
          <span className="truncate font-medium">
            {conv.title ?? t("chat.newChat")}
          </span>
        </div>
        <p className="text-xs text-slate-600 group-hover:text-slate-500">
          {formatRelativeDate(conv.updatedAt, locale)}
        </p>
      </Link>

      <DropdownMenu dir={locale === "ar" ? "rtl" : "ltr"}>
        <DropdownMenuTrigger asChild>
          <button
            onClick={e => e.stopPropagation()}
            className="absolute top-1/2 -translate-y-1/2 end-1.5 p-1.5 rounded-lg text-slate-500
                       opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100
                       hover:bg-slate-700 hover:text-slate-200 transition-all"
            aria-label={t("common.edit")}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="h-4 w-4 shrink-0" />
            {t("chat.renameConversation")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={async () => {
            const ok = await onTogglePin(conv.id, !conv.isPinned);
            if (!ok) toast.error(t("errors.generic"));
          }}>
            {conv.isPinned
              ? <PinOff className="h-4 w-4 shrink-0" />
              : <Pin className="h-4 w-4 shrink-0" />}
            {conv.isPinned ? t("chat.unpinConversation") : t("chat.pinConversation")}
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={async () => {
            const ok = await onDelete(conv.id);
            if (!ok) toast.error(t("errors.generic"));
          }}>
            <Trash2 className="h-4 w-4 shrink-0" />
            {t("chat.deleteConversation")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Shared between the desktop column and the mobile drawer — identical
// content, only the outer chrome (fixed column vs. overlay dialog) differs.
function SidebarBody({
  locale, onNavigate, isMobile = false,
}: { locale: string; onNavigate: () => void; isMobile?: boolean }) {
  const t         = useTranslations();
  const router    = useRouter();
  const pathname  = usePathname();
  const { grouped, loading, error, rename, togglePin, remove } = useConversations();
  const { data: session } = useSession();

  const groups: Array<{ key: keyof typeof grouped; labelKey: string }> = [
    { key: "pinned",    labelKey: "chat.pinned"    },
    { key: "today",     labelKey: "chat.today"     },
    { key: "yesterday", labelKey: "chat.yesterday" },
    { key: "thisWeek",  labelKey: "chat.thisWeek"  },
    { key: "older",     labelKey: "chat.older"     },
  ];

  async function handleDelete(id: string) {
    const isCurrent = pathname.includes(id);
    const ok = await remove(id);
    if (ok && isCurrent) router.push(`/${locale}/chat`);
    return ok;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
        <Link href={`/${locale}/chat`} onClick={onNavigate} className="flex items-baseline gap-2 group">
          <span className="w-6 h-6 rounded-md bg-[color:var(--accent-blue)] shrink-0 flex items-center justify-center
                            text-white text-xs font-display font-semibold">O</span>
          <span className="font-display text-lg text-slate-50 group-hover:text-[color:var(--accent-blue-light)] transition-colors">
            {locale === "ar" ? t("app.name") : t("app.nameEn")}
          </span>
        </Link>
        {/* This "X" only ever calls Radix's DialogClose when SidebarBody is
            actually mounted inside the mobile drawer's Dialog.Root (see
            isMobile below). The desktop column renders this exact same
            component with no Dialog.Root ancestor at all — Tailwind's
            `md:hidden` only hides the button visually there, it doesn't
            unmount it, so DialogPrimitive.Close's internal useContext call
            would throw "must be used within Dialog" on every desktop
            render (including SSR) if used unconditionally here. */}
        {isMobile ? (
          <DialogPrimitive.Close asChild>
            <button className="md:hidden p-1 text-slate-400 hover:text-slate-100 transition-colors" aria-label={t("common.cancel")}>
              <X className="h-4 w-4" />
            </button>
          </DialogPrimitive.Close>
        ) : (
          <button
            className="md:hidden p-1 text-slate-400 hover:text-slate-100 transition-colors"
            aria-label={t("common.cancel")}
            onClick={onNavigate}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-3 flex-shrink-0">
        <button onClick={() => { router.push(`/${locale}/chat`); onNavigate(); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[color:var(--accent-blue)]
                     hover:brightness-110 text-white rounded-xl font-medium text-sm transition-all active:scale-[0.98]
                     shadow-[var(--shadow-elevation-1)]">
          <SquarePen className="h-4 w-4" /> {t("chat.newChat")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="space-y-2 p-2">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <p className="text-center text-slate-600 text-sm py-8 px-3">{t("errors.network")}</p>
        ) : (
          <>
            {groups.map(({ key, labelKey }) => {
              const items = grouped[key];
              if (!items?.length) return null;
              return (
                <div key={key} className="mb-2">
                  <p className="text-xs text-slate-600 px-3 py-2 font-medium uppercase tracking-wider">
                    {t(labelKey as Parameters<typeof t>[0])}
                  </p>
                  <div className="space-y-0.5">
                    {items.map(conv => (
                      <div key={conv.id} onClick={onNavigate} role="presentation">
                        <ConversationItem
                          conv={conv}
                          locale={locale}
                          isActive={pathname.includes(conv.id)}
                          onRename={rename}
                          onTogglePin={togglePin}
                          onDelete={handleDelete}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {!Object.values(grouped).some(g => g.length > 0) && (
              <p className="text-center text-slate-600 text-sm py-8">{t("chat.noConversations")}</p>
            )}
          </>
        )}
      </div>

      <div className="p-3 border-t border-slate-800 space-y-2 flex-shrink-0">
        <AccountMenu locale={locale} />
        {session && <BalanceWidget locale={locale} />}
        <div className="flex items-center justify-between gap-2">
          <LanguageSwitcher />
          <div className="flex items-center gap-1">
            <Link href={`/${locale}/settings`} onClick={onNavigate}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label={t("nav.settings")}>
              <Settings className="h-4 w-4" />
            </Link>
            <Link href={`/${locale}/admin/dashboard`} onClick={onNavigate}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label={t("nav.admin")}>
              <ShieldCheck className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatSidebar({ locale, isOpen, onClose }: Props) {
  const isRTL = locale === "ar";
  const noop  = () => {};

  return (
    <>
      {/* Desktop: permanent column, width animates open/closed. No template-
          literal Tailwind classes — Tailwind can't see dynamic class names,
          so state drives inline width + a conditional literal class instead. */}
      <motion.aside
        initial={false}
        animate={{ width: isOpen ? 288 : 0 }}
        transition={{ type: "tween", duration: 0.2, ease: "easeInOut" }}
        className={cn(
          "hidden md:flex flex-col overflow-hidden bg-[color:var(--bg-surface)] border-e border-slate-800"
        )}
      >
        <div className="w-72 h-full flex-shrink-0">
          <SidebarBody locale={locale} onNavigate={noop} />
        </div>
      </motion.aside>

      {/* Mobile: Radix Dialog drawer, spring slide from the inline-start
          edge (right in Arabic, left in English) via framer-motion. */}
      <DialogPrimitive.Root open={isOpen} onOpenChange={o => { if (!o) onClose(); }}>
        <AnimatePresence>
          {isOpen && (
            <DialogPrimitive.Portal forceMount>
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  className="md:hidden fixed inset-0 bg-black/60 z-40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  className={cn(
                    "md:hidden fixed inset-y-0 z-50 w-72 bg-[color:var(--bg-surface)]",
                    "shadow-[var(--shadow-elevation-3)] focus:outline-none",
                    isRTL ? "end-0" : "start-0"
                  )}
                  initial={{ x: isRTL ? "100%" : "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: isRTL ? "100%" : "-100%" }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                >
                  <DialogPrimitive.Title className="sr-only">
                    {locale === "ar" ? "قائمة المحادثات" : "Conversation menu"}
                  </DialogPrimitive.Title>
                  <SidebarBody locale={locale} onNavigate={onClose} isMobile />
                </motion.div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          )}
        </AnimatePresence>
      </DialogPrimitive.Root>
    </>
  );
}
