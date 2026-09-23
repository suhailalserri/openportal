/**
 * apps/web/lib/csv.ts (Phase 8b)
 *
 * Client-side CSV building for admin exports (code batches today;
 * anything else that needs a CSV later should go through this, not
 * hand-roll its own join). Two things every admin CSV export in this
 * codebase must do, that string-joining rows by hand tends to forget:
 *
 * 1. **Formula-injection guard.** A cell that starts with `=`, `+`, `-`,
 *    `@`, tab, or CR is prefixed with a leading `'` before quoting, so
 *    Excel/Sheets/LibreOffice render it as literal text instead of
 *    evaluating it as a formula when the file is opened — the classic
 *    CSV-injection vector (a redeem code or a batch label is
 *    admin-authored today, but this guards it regardless of source).
 *    The existing 5.2 billing CSV export does NOT have this guard —
 *    flagged as a known gap in the phase summary, left as-is rather
 *    than fixed here since it's out of this phase's scope.
 * 2. **RFC 4180 quoting.** Every field is quoted; embedded quotes are
 *    doubled. A code or label containing a comma, quote, or newline
 *    (any admin-typed batch label can) would otherwise corrupt the
 *    column count.
 *
 * `downloadCsv` triggers a client-side download via a Blob + a
 * throwaway `<a>` — no server round-trip, consistent with codes being
 * bearer credentials that should never transit a URL unnecessarily
 * (see BRANCH_AND_CI_NOTES.md's 8b "Code leak" note).
 */

const RISKY_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (RISKY_PREFIX.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCell).join(","), ...rows.map((row) => row.map(escapeCell).join(","))];
  // CRLF per RFC 4180; also what Excel expects for reliable line breaks.
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // UTF-8 BOM so Excel on Windows doesn't mis-render Arabic labels.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
