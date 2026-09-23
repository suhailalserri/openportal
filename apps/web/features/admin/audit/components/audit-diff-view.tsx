"use client";

import { useTranslations } from "next-intl";

interface AuditDiffViewProps {
  before: unknown;
  after: unknown;
}

/**
 * apps/web/features/admin/audit/components/audit-diff-view.tsx (Phase 8c)
 *
 * `auditLogs.before`/`after` are untyped `jsonb` — every router call
 * site shapes them differently (a full row snapshot for `package.update`,
 * a small `{status, reason}` object for `user.suspend`, `after` only and
 * no `before` for creates). There is no shared shape to build a "real"
 * structural diff against, so this does the honest, robust thing: union
 * of top-level keys across both objects, one row per key, `before`/
 * `after` shown side by side, changed keys highlighted. Nested objects
 * are rendered as formatted JSON within their cell rather than recursed
 * into — good enough for an admin scanning what changed, without
 * building a general deep-diff algorithm for a page this narrow in
 * scope.
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function renderValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

export function AuditDiffView({ before, after }: AuditDiffViewProps) {
  const t = useTranslations("admin.auditPage.diff");

  const beforeObj = isPlainObject(before) ? before : null;
  const afterObj = isPlainObject(after) ? after : null;

  if (!beforeObj && !afterObj) {
    // Neither side is a plain object (both null, or a primitive/array) —
    // just show the two values raw, no key-by-key table possible.
    return (
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="mb-1 font-medium text-muted-foreground">{t("before")}</p>
          <pre className="whitespace-pre-wrap rounded-[10px] bg-secondary p-2">{renderValue(before)}</pre>
        </div>
        <div>
          <p className="mb-1 font-medium text-muted-foreground">{t("after")}</p>
          <pre className="whitespace-pre-wrap rounded-[10px] bg-secondary p-2">{renderValue(after)}</pre>
        </div>
      </div>
    );
  }

  const keys = Array.from(new Set([...Object.keys(beforeObj ?? {}), ...Object.keys(afterObj ?? {})])).sort();

  if (keys.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("noFields")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-[10px] border">
      <table className="w-full text-xs">
        <thead className="bg-secondary">
          <tr>
            <th className="p-2 text-start font-medium">{t("field")}</th>
            <th className="p-2 text-start font-medium">{t("before")}</th>
            <th className="p-2 text-start font-medium">{t("after")}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const b = beforeObj?.[key];
            const a = afterObj?.[key];
            const changed = JSON.stringify(b) !== JSON.stringify(a);
            return (
              <tr key={key} className={changed ? "bg-warning/5" : undefined}>
                <td className="p-2 font-mono text-[11px] text-muted-foreground">{key}</td>
                <td className="max-w-64 whitespace-pre-wrap break-words p-2">{renderValue(b)}</td>
                <td className={`max-w-64 whitespace-pre-wrap break-words p-2 ${changed ? "font-medium text-foreground" : ""}`}>
                  {renderValue(a)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
