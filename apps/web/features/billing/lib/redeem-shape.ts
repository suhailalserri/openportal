/**
 * apps/web/features/billing/lib/redeem-shape.ts (Phase 5.1)
 *
 * Client-side redeem-code helpers: SHAPE only (alphabet + 4x4 grouping),
 * never the checksum. Rule 5 (FRONTEND_REBUILD_PLAN.md §3): "The redeem
 * checksum stays server-side (CODE_SALT). The client checks shape only."
 *
 * The real generator/validator (apps/api/src/services/redeem.service.ts
 * `generateCode`/`validateCodeFormat`, and its frozen client-side mirror
 * apps/web/lib/generate-code.ts) uses `node:crypto`'s HMAC with
 * `CODE_SALT` and is a server module — it is not safe or possible to
 * import from a client component regardless of the frozen zone. The
 * alphabet string itself is duplicated here deliberately (documented,
 * not accidental): both `apps/web/lib/generate-code.ts` and
 * `apps/api/src/services/redeem.service.ts` are frozen/backend, and
 * `packages/config` is outside `apps/web` and therefore also frozen for
 * this session (FRONTEND_REBUILD_PLAN.md §4 "Frozen zone... everything
 * outside apps/web") — so this file cannot import it from there either.
 * If a later backend (B*) session wants one shared export, hoist this
 * exact alphabet into `packages/config` then; until that lands, this is
 * the only copy on the frontend and nothing here can silently drift into
 * accepting a code the server would reject as a false negative (worst
 * case is a slightly-too-strict client warning, never a false accept —
 * the server is always the final word).
 */

/** No ambiguous chars: 0/O, 1/I/L are excluded. Mirrors the server alphabet exactly. */
export const REDEEM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const ALPHABET_SET = new Set(REDEEM_CODE_ALPHABET.split(""));

export const REDEEM_CODE_GROUP_LENGTH = 4;
export const REDEEM_CODE_GROUP_COUNT = 4; // 3 body groups + 1 checksum group
export const REDEEM_CODE_MAX_CHARS = REDEEM_CODE_GROUP_LENGTH * REDEEM_CODE_GROUP_COUNT;

const SHAPE_PATTERN = new RegExp(
  `^[${REDEEM_CODE_ALPHABET}]{${REDEEM_CODE_GROUP_LENGTH}}(-[${REDEEM_CODE_ALPHABET}]{${REDEEM_CODE_GROUP_LENGTH}}){${
    REDEEM_CODE_GROUP_COUNT - 1
  }}$`
);

/**
 * Formats raw keystrokes/paste input into `XXXX-XXXX-XXXX-XXXX`:
 * uppercases, drops any character outside the alphabet (this silently
 * eats ambiguous chars like 0/O/1/I/L along with punctuation/whitespace
 * — a user who mistypes those just doesn't see them appear, which is
 * gentler than an inline error while typing), inserts a dash after
 * every 4 characters, and caps at 16 alphabet characters total.
 */
export function formatRedeemInput(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .split("")
    .filter((ch) => ALPHABET_SET.has(ch))
    .slice(0, REDEEM_CODE_MAX_CHARS)
    .join("");

  const groups: string[] = [];
  for (let i = 0; i < cleaned.length; i += REDEEM_CODE_GROUP_LENGTH) {
    groups.push(cleaned.slice(i, i + REDEEM_CODE_GROUP_LENGTH));
  }
  return groups.join("-");
}

/** True once the formatted value has the right shape (4 groups of 4). Never checks the checksum. */
export function isRedeemShapeComplete(formatted: string): boolean {
  return SHAPE_PATTERN.test(formatted);
}
