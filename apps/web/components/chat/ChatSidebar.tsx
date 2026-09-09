"use client";
import { useTranslations }   from "next-intl";
import Link                  from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { BalanceWidget }     from "../shared/BalanceWidget";
import { LanguageSwitcher }  from "../shared/LanguageSwitcher";
import { useConversations }  from "@/hooks/useConversations";
import { Skeleton }          from "../ui/skeleton";
import { formatRelativeDate } from "@/lib/utils";
import { MODEL_CATALOG }     from "@ai-platform/config";

interface Props { locale: string; isOpen: boolean; onClose: () => void }

function ConversationItem({ conv, locale, isActive }: {
  conv:     { id: string; title: string | null; modelId: string | null; updatedAt: string };
  locale:   string;
  isActive: boolean;
}) {
  const model = MODEL_CATALOG.find(m => m.id === conv.modelId);
  return (
    <Link href={`/${locale}/chat/${conv.id}`}
      className={`block px-3 py-2 rounded-xl text-sm transition-colors group
        ${isActive ? "bg-blue-600/20 border border-blue-700/40 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-700"}`}>
      <div className="flex items-center gap-2 mb-0.5">
        {model && <span className="text-xs">{model.badge}</span>}
        <span className="truncate font-medium">
          {conv.title ?? "محادثة جديدة"}
        </span>
      </div>
      <p className="text-xs text-slate-600 group-hover:text-slate-500">
        {formatRelativeDate(conv.updatedAt, locale)}
      </p>
    </Link>
  );
}

export function ChatSidebar({ locale, isOpen, onClose }: Props) {
  const t         = useTranslations();
  const router    = useRouter();
  const pathname  = usePathname();
  const { grouped, loading } = useConversations();

  const groups: Array<{ key: keyof typeof grouped; labelKey: string }> = [
    { key: "pinned",    labelKey: "chat.pinned"    },
    { key: "today",     labelKey: "chat.today"     },
    { key: "yesterday", labelKey: "chat.yesterday" },
    { key: "thisWeek",  labelKey: "chat.thisWeek"  },
    { key: "older",     labelKey: "chat.older"     },
  ];

  return (
    <>
      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-30" onClick={onClose} />
      )}

      <aside className={`
        fixed md:relative inset-y-0 start-0 z-40
        flex flex-col bg-[#1E293B] border-e border-slate-700
        transition-all duration-200 ease-in-out
        ${isOpen ? "w-72 translate-x-0" : "w-0 -translate-x-full md:translate-x-0 md:w-0 overflow-hidden"}
        md:${isOpen ? "w-72" : "w-0"}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
          <Link href={`/${locale}/chat`} className="font-bold text-white text-lg hover:text-blue-400 transition-colors">
            {locale === "ar" ? "منصة الذكاء" : "AI Platform"}
          </Link>
          <button onClick={onClose} className="md:hidden p-1 text-slate-400 hover:text-white">✕</button>
        </div>

        {/* New Chat */}
        <div className="p-3 flex-shrink-0">
          <button onClick={() => { router.push(`/${locale}/chat`); onClose(); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600
                       hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors">
            <span>✏️</span> {t("chat.newChat")}
          </button>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <div className="space-y-2 p-2">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <>
              {groups.map(({ key, labelKey }) => {
                const items = grouped[key];
                if (!items?.length) return null;
                return (
                  <div key={key} className="mb-2">
                    <p className="text-xs text-slate-500 px-3 py-2 font-medium uppercase tracking-wider">
                      {t(labelKey as Parameters<typeof t>[0])}
                    </p>
                    <div className="space-y-0.5">
                      {items.map(conv => (
                        <ConversationItem
                          key={conv.id}
                          conv={conv}
                          locale={locale}
                          isActive={pathname.includes(conv.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
              {!Object.values(grouped).some(g => g.length > 0) && (
                <p className="text-center text-slate-600 text-sm py-8">
                  {t("chat.noConversations")}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700 space-y-2 flex-shrink-0">
          <BalanceWidget locale={locale} />
          <div className="flex items-center justify-between gap-2">
            <LanguageSwitcher />
            <Link href={`/${locale}/settings`}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-sm">
              ⚙️
            </Link>
            <Link href={`/${locale}/admin/dashboard`}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-sm">
              🛡️
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
