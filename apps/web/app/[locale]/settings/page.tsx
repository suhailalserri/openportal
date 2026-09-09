"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";

export default function SettingsPage() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function generateApiKey() {
    setGenerating(true);
    try {
      const res  = await fetch("/api/user/api-key", { method: "POST" });
      const data = await res.json() as { key: string };
      setApiKey(data.key);
      toast.success(locale === "ar" ? "تم إنشاء مفتاح API" : "API key generated");
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setGenerating(false);
    }
  }

  async function revokeApiKey() {
    try {
      await fetch("/api/user/api-key", { method: "DELETE" });
      setApiKey(null);
      toast.success(locale === "ar" ? "تم إلغاء مفتاح API" : "API key revoked");
    } catch {
      toast.error(t("errors.generic"));
    }
  }

  return (
    <div className="min-h-screen bg-[#0F172A] p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-white">{t("nav.settings")}</h1>

        {/* Profile */}
        <Card>
          <CardHeader><h2 className="font-semibold text-white">{t("settings.profile")}</h2></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t("auth.displayName")}</label>
              <input className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                               text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t("auth.email")}</label>
              <input disabled dir="ltr"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3
                           text-slate-400 text-sm cursor-not-allowed" />
            </div>
            <Button variant="secondary">{t("common.save")}</Button>
          </CardContent>
        </Card>

        {/* Language */}
        <Card>
          <CardHeader><h2 className="font-semibold text-white">{t("settings.preferences")}</h2></CardHeader>
          <CardContent>
            <div>
              <label className="block text-sm text-slate-400 mb-2">{t("settings.language")}</label>
              <div className="flex gap-2">
                {(["ar","en"] as const).map(l => (
                  <a key={l} href={`/${l}/settings`}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors
                      ${locale === l
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "border-slate-600 text-slate-400 hover:border-slate-500"}`}>
                    {l === "ar" ? "🇸🇦 العربية" : "🇬🇧 English"}
                  </a>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Access */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">{t("settings.apiAccess")}</h2>
            <p className="text-sm text-slate-400 mt-1">
              {locale === "ar"
                ? "استخدم منصتنا من تطبيقاتك عبر API متوافق مع OpenAI"
                : "Use our platform from your apps via OpenAI-compatible API"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {apiKey ? (
              <div>
                <p className="text-sm text-amber-400 mb-2">⚠️ {t("settings.apiKeyWarning")}</p>
                <div className="bg-[#0F172A] rounded-xl px-4 py-3 font-mono text-sm text-green-400
                                border border-slate-700 break-all select-all" dir="ltr">
                  {apiKey}
                </div>
                <Button variant="danger" className="mt-3" onClick={() => setApiKey(null)}>
                  {locale === "ar" ? "تم الحفظ — إخفاء المفتاح" : "Saved — Hide Key"}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" loading={generating} onClick={generateApiKey}>
                {t("settings.generateApiKey")}
              </Button>
            )}

            <div className="mt-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <p className="text-xs text-slate-400 font-medium mb-2">
                {locale === "ar" ? "مثال الاستخدام:" : "Usage example:"}
              </p>
              <pre dir="ltr" className="text-xs text-slate-300 overflow-x-auto">{`curl https://api.yourdomain.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-aip-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello!"}]}'`}</pre>
            </div>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card>
          <CardHeader><h2 className="font-semibold text-white">{t("settings.data")}</h2></CardHeader>
          <CardContent className="space-y-3">
            <Button variant="secondary">{t("settings.exportData")}</Button>
            <div className="border-t border-slate-700 pt-4">
              <p className="text-xs text-slate-500 mb-3">{t("settings.deleteWarning")}</p>
              <Button variant="danger">{t("settings.deleteAccount")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
