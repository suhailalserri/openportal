"use client";
import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  changePassword, twoFactor, signOut,
} from "@/lib/auth-client";

type SessionRow = {
  id: string; ip?: string | null;
  userAgent?: string | null; createdAt: string | Date; updatedAt: string | Date;
  expiresAt: string | Date; current: boolean;
};

export default function SettingsPage() {
  const t = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const utils = trpc.useUtils();

  // ── Profile ──────────────────────────────────────────────────────────
  const profile = trpc.user.getProfile.useQuery();
  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحفظ" : "Saved");
      utils.user.getProfile.invalidate();
    },
    onError: () => toast.error(t("errors.generic")),
  });
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    if (profile.data?.displayName) setDisplayName(profile.data.displayName);
  }, [profile.data?.displayName]);

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
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-3
                               text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t("auth.email")}</label>
              <input disabled dir="ltr" value={profile.data?.email ?? ""} readOnly
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3
                           text-slate-400 text-sm cursor-not-allowed" />
            </div>
            <Button
              variant="secondary"
              loading={updateProfile.isPending}
              disabled={!displayName.trim() || displayName === profile.data?.displayName}
              onClick={() => updateProfile.mutate({ displayName: displayName.trim() })}
            >
              {t("common.save")}
            </Button>
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

        <SecuritySection
          locale={locale}
          twoFactorEnabled={!!profile.data?.twoFactorEnabled}
          onTwoFactorChange={() => utils.user.getProfile.invalidate()}
        />
        <ApiAccessSection locale={locale} t={t} />
        <DangerZoneSection locale={locale} t={t} router={router} />
      </div>
    </div>
  );
}


// ── Security: change password, 2FA, active sessions ───────────────────
function SecuritySection({
  locale, twoFactorEnabled, onTwoFactorChange,
}: {
  locale: string;
  twoFactorEnabled: boolean;
  onTwoFactorChange: () => void;
}) {
  const ar = locale === "ar";

  // -- change password --
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [pwSaving, setPwSaving] = useState(false);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast.error(ar ? "كلمتا المرور الجديدتان غير متطابقتين" : "New passwords don't match");
      return;
    }
    if (newPw.length < 8) {
      toast.error(ar ? "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل" : "Password must be at least 8 characters");
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await changePassword({
        currentPassword: currentPw,
        newPassword: newPw,
        revokeOtherSessions: signOutOthers,
      });
      if (error) {
        toast.error(
          error.message ??
          (ar ? "كلمة المرور الحالية غير صحيحة" : "Current password is incorrect")
        );
        return;
      }
      toast.success(ar ? "تم تغيير كلمة المرور" : "Password changed");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch {
      toast.error(ar ? "حدث خطأ ما" : "Something went wrong");
    } finally {
      setPwSaving(false);
    }
  }

  // -- 2FA --
  const [enrolling, setEnrolling]   = useState(false);
  const [enrollPw,  setEnrollPw]    = useState("");
  const [enrollData, setEnrollData] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [busy2fa, setBusy2fa] = useState(false);
  const [disablePw, setDisablePw] = useState("");
  const [showDisable, setShowDisable] = useState(false);

  const secretFromUri = (() => {
    if (!enrollData) return "";
    try { return new URL(enrollData.totpURI).searchParams.get("secret") ?? ""; }
    catch { return ""; }
  })();

  async function handleStartEnroll(e: FormEvent) {
    e.preventDefault();
    setBusy2fa(true);
    try {
      const { data, error } = await twoFactor.enable({ password: enrollPw });
      if (error || !data) {
        toast.error(ar ? "كلمة المرور غير صحيحة" : "Incorrect password");
        return;
      }
      setEnrollData({ totpURI: data.totpURI, backupCodes: data.backupCodes });
      setEnrollPw("");
    } catch {
      toast.error(ar ? "حدث خطأ ما" : "Something went wrong");
    } finally {
      setBusy2fa(false);
    }
  }

  async function handleConfirmEnroll(e: FormEvent) {
    e.preventDefault();
    setBusy2fa(true);
    try {
      const { error } = await twoFactor.verifyTotp({ code: confirmCode });
      if (error) {
        toast.error(ar ? "رمز غير صحيح" : "Invalid code");
        return;
      }
      toast.success(ar ? "تم تفعيل التحقق بخطوتين" : "Two-factor authentication enabled");
      setEnrolling(false); setEnrollData(null); setConfirmCode("");
      onTwoFactorChange();
    } catch {
      toast.error(ar ? "حدث خطأ ما" : "Something went wrong");
    } finally {
      setBusy2fa(false);
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    setBusy2fa(true);
    try {
      const { error } = await twoFactor.disable({ password: disablePw });
      if (error) {
        toast.error(ar ? "كلمة المرور غير صحيحة" : "Incorrect password");
        return;
      }
      toast.success(ar ? "تم إيقاف التحقق بخطوتين" : "Two-factor authentication disabled");
      setShowDisable(false); setDisablePw("");
      onTwoFactorChange();
    } catch {
      toast.error(ar ? "حدث خطأ ما" : "Something went wrong");
    } finally {
      setBusy2fa(false);
    }
  }

  // -- active sessions --
  // Fetched from our own /api/user/sessions routes (direct db reads/writes),
  // not authClient.listSessions()/revokeSession() — see those routes' file
  // comments for why: better-auth's client masks the token field needed
  // for per-device revoke on every session but the current one.
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  async function loadSessions() {
    try {
      const res = await fetch("/api/user/sessions");
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    }
  }
  useEffect(() => { loadSessions(); }, []);

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/user/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(ar ? "تعذّر إنهاء الجلسة" : "Couldn't revoke that session");
        return;
      }
      toast.success(ar ? "تم إنهاء الجلسة" : "Session revoked");
      loadSessions();
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokingOthers(true);
    try {
      await fetch("/api/user/sessions", { method: "DELETE" });
      toast.success(ar ? "تم تسجيل الخروج من الأجهزة الأخرى" : "Signed out of other devices");
      loadSessions();
    } finally {
      setRevokingOthers(false);
    }
  }

  return (
    <Card>
      <CardHeader><h2 className="font-semibold text-white">{ar ? "الأمان" : "Security"}</h2></CardHeader>
      <CardContent className="space-y-6">

        {/* Change password */}
        <form onSubmit={handleChangePassword} className="space-y-3">
          <h3 className="text-sm font-medium text-slate-300">{ar ? "تغيير كلمة المرور" : "Change password"}</h3>
          <input type="password" required autoComplete="current-password" value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
            placeholder={ar ? "كلمة المرور الحالية" : "Current password"}
            className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm
                       focus:outline-none focus:border-blue-500" />
          <input type="password" required autoComplete="new-password" minLength={8} value={newPw}
            onChange={e => setNewPw(e.target.value)}
            placeholder={ar ? "كلمة المرور الجديدة" : "New password"}
            className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm
                       focus:outline-none focus:border-blue-500" />
          <input type="password" required autoComplete="new-password" value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            placeholder={ar ? "تأكيد كلمة المرور الجديدة" : "Confirm new password"}
            className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm
                       focus:outline-none focus:border-blue-500" />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={signOutOthers} onChange={e => setSignOutOthers(e.target.checked)} />
            {ar ? "تسجيل الخروج من جميع الأجهزة الأخرى" : "Sign out of all other devices"}
          </label>
          <Button type="submit" variant="secondary" size="sm" loading={pwSaving}>
            {ar ? "تحديث كلمة المرور" : "Update password"}
          </Button>
        </form>

        {/* 2FA */}
        <div className="border-t border-slate-700 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">
              {ar ? "التحقق بخطوتين (2FA)" : "Two-factor authentication"}
            </h3>
            <span className={`text-xs px-2 py-1 rounded-full ${twoFactorEnabled
              ? "bg-green-500/10 text-green-400" : "bg-slate-700 text-slate-400"}`}>
              {twoFactorEnabled ? (ar ? "مفعّل" : "Enabled") : (ar ? "غير مفعّل" : "Disabled")}
            </span>
          </div>

          {twoFactorEnabled ? (
            showDisable ? (
              <form onSubmit={handleDisable} className="space-y-2">
                <input type="password" required value={disablePw} onChange={e => setDisablePw(e.target.value)}
                  placeholder={ar ? "كلمة المرور لتأكيد الإيقاف" : "Password to confirm"}
                  className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm
                             focus:outline-none focus:border-red-500" />
                <div className="flex gap-2">
                  <Button type="submit" variant="danger" size="sm" loading={busy2fa}>
                    {ar ? "تأكيد الإيقاف" : "Confirm disable"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowDisable(false)}>
                    {ar ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setShowDisable(true)}>
                {ar ? "إيقاف التحقق بخطوتين" : "Disable 2FA"}
              </Button>
            )
          ) : enrolling ? (
            enrollData ? (
              <form onSubmit={handleConfirmEnroll} className="space-y-3">
                <p className="text-xs text-slate-400">
                  {ar
                    ? "امسح الرمز في تطبيق المصادقة، أو أدخل المفتاح يدوياً، ثم أدخل الرمز المكوّن من 6 أرقام:"
                    : "Scan into your authenticator app, or enter the key manually, then enter the 6-digit code:"}
                </p>
                <a href={enrollData.totpURI}
                  className="block text-xs text-blue-400 hover:text-blue-300 break-all" dir="ltr">
                  {ar ? "فتح في تطبيق المصادقة →" : "Open in authenticator app →"}
                </a>
                {secretFromUri && (
                  <div className="bg-[#0F172A] rounded-xl px-4 py-2.5 font-mono text-xs text-green-400
                                   border border-slate-700 select-all break-all" dir="ltr">
                    {secretFromUri}
                  </div>
                )}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                  <p className="text-xs text-amber-400 font-medium mb-1.5">
                    {ar ? "رموز احتياطية — احفظها الآن، لن تظهر مرة أخرى:" : "Backup codes — save these now, they won't be shown again:"}
                  </p>
                  <div className="grid grid-cols-2 gap-1 font-mono text-xs text-slate-300" dir="ltr">
                    {enrollData.backupCodes.map(c => <span key={c}>{c}</span>)}
                  </div>
                </div>
                <input value={confirmCode} onChange={e => setConfirmCode(e.target.value)} required
                  inputMode="numeric" dir="ltr" placeholder="123456" autoFocus
                  className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm
                             text-center tracking-widest focus:outline-none focus:border-blue-500" />
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" size="sm" loading={busy2fa}>
                    {ar ? "تأكيد التفعيل" : "Confirm & enable"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => { setEnrolling(false); setEnrollData(null); }}>
                    {ar ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleStartEnroll} className="space-y-2">
                <input type="password" required value={enrollPw} onChange={e => setEnrollPw(e.target.value)}
                  placeholder={ar ? "كلمة المرور لبدء التفعيل" : "Password to begin setup"}
                  className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm
                             focus:outline-none focus:border-blue-500" />
                <div className="flex gap-2">
                  <Button type="submit" variant="secondary" size="sm" loading={busy2fa}>
                    {ar ? "متابعة" : "Continue"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEnrolling(false)}>
                    {ar ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              </form>
            )
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setEnrolling(true)}>
              {ar ? "تفعيل التحقق بخطوتين" : "Enable 2FA"}
            </Button>
          )}
        </div>

        {/* Active sessions */}
        <div className="border-t border-slate-700 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">{ar ? "الجلسات النشطة" : "Active sessions"}</h3>
            {(sessions?.length ?? 0) > 1 && (
              <button onClick={handleRevokeOthers} disabled={revokingOthers}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                {ar ? "تسجيل الخروج من الأجهزة الأخرى" : "Log out other devices"}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {sessions === null && <p className="text-xs text-slate-500">{ar ? "جارٍ التحميل…" : "Loading…"}</p>}
            {sessions?.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-slate-800/50 border border-slate-700
                                          rounded-xl px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {s.userAgent
                      ? s.userAgent.slice(0, 60)
                      : (ar ? "جهاز غير معروف" : "Unknown device")}
                    {s.current && (
                      <span className="ms-2 text-xs text-blue-400">{ar ? "(هذا الجهاز)" : "(this device)"}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.ip ?? ""} · {formatRelativeDate(s.updatedAt, locale)}
                  </p>
                </div>
                {!s.current && (
                  <button onClick={() => handleRevoke(s.id)} disabled={revokingId === s.id}
                    className="text-xs text-red-400 hover:text-red-300 shrink-0 ms-3 disabled:opacity-50">
                    {ar ? "إنهاء" : "Revoke"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── API Access ──────────────────────────────────────────────────────────
function ApiAccessSection({ locale, t }: { locale: string; t: ReturnType<typeof useTranslations> }) {
  const ar = locale === "ar";
  const utils = trpc.useUtils();
  const keyInfo = trpc.user.getApiKeyInfo.useQuery();
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const generate = trpc.user.generateApiKey.useMutation({
    onSuccess: (data) => {
      setFreshKey(data.key);
      toast.success(ar ? "تم إنشاء مفتاح API" : "API key generated");
      utils.user.getApiKeyInfo.invalidate();
    },
    onError: () => toast.error(t("errors.generic")),
  });

  const revoke = trpc.user.revokeApiKey.useMutation({
    onSuccess: () => {
      setFreshKey(null);
      toast.success(ar ? "تم إلغاء مفتاح API" : "API key revoked");
      utils.user.getApiKeyInfo.invalidate();
    },
    onError: () => toast.error(t("errors.generic")),
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-white">{t("settings.apiAccess")}</h2>
        <p className="text-sm text-slate-400 mt-1">
          {ar
            ? "استخدم منصتنا من تطبيقاتك عبر API متوافق مع OpenAI"
            : "Use our platform from your apps via OpenAI-compatible API"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {freshKey ? (
          <div>
            <p className="text-sm text-amber-400 mb-2">⚠️ {t("settings.apiKeyWarning")}</p>
            <div className="bg-[#0F172A] rounded-xl px-4 py-3 font-mono text-sm text-green-400
                            border border-slate-700 break-all select-all" dir="ltr">
              {freshKey}
            </div>
            <Button variant="danger" className="mt-3" size="sm" onClick={() => setFreshKey(null)}>
              {ar ? "تم الحفظ — إخفاء المفتاح" : "Saved — Hide Key"}
            </Button>
          </div>
        ) : keyInfo.data?.hasKey ? (
          <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700
                          rounded-xl px-4 py-3">
            <span className="font-mono text-sm text-slate-300" dir="ltr">{keyInfo.data.prefix}</span>
            <button onClick={() => revoke.mutate()} className="text-xs text-red-400 hover:text-red-300">
              {ar ? "إلغاء" : "Revoke"}
            </button>
          </div>
        ) : (
          <Button variant="secondary" loading={generate.isPending} onClick={() => generate.mutate()}>
            {t("settings.generateApiKey")}
          </Button>
        )}

        <div className="mt-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
          <p className="text-xs text-slate-400 font-medium mb-2">
            {ar ? "مثال الاستخدام:" : "Usage example:"}
          </p>
          <pre dir="ltr" className="text-xs text-slate-300 overflow-x-auto">{`curl https://api.yourdomain.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-aip-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello!"}]}'`}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Danger zone: export data, delete account ───────────────────────────
function DangerZoneSection({
  locale, t, router,
}: {
  locale: string;
  t: ReturnType<typeof useTranslations>;
  router: ReturnType<typeof useRouter>;
}) {
  const ar = locale === "ar";
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deletePw, setDeletePw]     = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/user/export-data");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = "account-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    setDeleting(true);
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: deletePw || undefined,
          confirmed: confirmText.trim().toUpperCase() === "DELETE",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data.error === "INCORRECT_PASSWORD"  ? (ar ? "كلمة المرور غير صحيحة" : "Incorrect password") :
          data.error === "CONFIRMATION_REQUIRED" ? (ar ? 'اكتب "DELETE" للتأكيد' : 'Type "DELETE" to confirm') :
          data.error === "TOO_MANY_ATTEMPTS" ? (ar ? "محاولات كثيرة جداً" : "Too many attempts") :
          t("errors.generic");
        toast.error(msg);
        return;
      }
      await signOut();
      router.push(`/${locale}/auth/login`);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader><h2 className="font-semibold text-white">{t("settings.data")}</h2></CardHeader>
      <CardContent className="space-y-3">
        <Button variant="secondary" loading={exporting} onClick={handleExport}>
          {t("settings.exportData")}
        </Button>

        <div className="border-t border-slate-700 pt-4">
          <p className="text-xs text-slate-500 mb-3">{t("settings.deleteWarning")}</p>
          {confirming ? (
            <form onSubmit={handleDelete} className="space-y-2">
              <input type="password" value={deletePw} onChange={e => setDeletePw(e.target.value)}
                placeholder={ar ? "كلمة المرور (إن وجدت)" : "Password (if you have one)"}
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm
                           focus:outline-none focus:border-red-500" />
              <input value={confirmText} onChange={e => setConfirmText(e.target.value)} required dir="ltr"
                placeholder={ar ? 'اكتب DELETE للتأكيد' : 'Type DELETE to confirm'}
                className="w-full bg-[#0F172A] border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm
                           focus:outline-none focus:border-red-500" />
              <div className="flex gap-2">
                <Button type="submit" variant="danger" size="sm" loading={deleting}
                  disabled={confirmText.trim().toUpperCase() !== "DELETE"}>
                  {t("settings.deleteAccount")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  {ar ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              {t("settings.deleteAccount")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
