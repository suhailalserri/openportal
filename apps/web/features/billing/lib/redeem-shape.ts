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

/**
 * The LAST group (the checksum) is NOT drawn from the 31-char alphabet: the
 * server builds it as `hmac.digest("hex").slice(0, 4).toUpperCase()`
 * (apps/api/src/services/redeem.service.ts), i.e. characters 0-9 and A-F.
 * That is why real codes legitimately end in things like "EE19" — with a
 * 1 and a 0 that the body alphabet excludes. Treating the checksum group
 * with the body alphabet silently deleted those characters while typing or
 * pasting, so a valid code could never be entered (reported bug).
 */
export const REDEEM_CHECKSUM_ALPHABET = "0123456789ABCDEF";

const ALPHABET_SET = new Set(REDEEM_CODE_ALPHABET.split(""));
const CHECKSUM_SET = new Set(REDEEM_CHECKSUM_ALPHABET.split(""));

export const REDEEM_CODE_GROUP_LENGTH = 4;
export const REDEEM_CODE_GROUP_COUNT = 4; // 3 body groups + 1 checksum group
export const REDEEM_CODE_MAX_CHARS = REDEEM_CODE_GROUP_LENGTH * REDEEM_CODE_GROUP_COUNT;
const BODY_CHARS = REDEEM_CODE_GROUP_LENGTH * (REDEEM_CODE_GROUP_COUNT - 1);

const SHAPE_PATTERN = new RegExp(
  `^[${REDEEM_CODE_ALPHABET}]{${REDEEM_CODE_GROUP_LENGTH}}(-[${REDEEM_CODE_ALPHABET}]{${REDEEM_CODE_GROUP_LENGTH}}){${
    REDEEM_CODE_GROUP_COUNT - 2
  }}-[${REDEEM_CHECKSUM_ALPHABET}]{${REDEEM_CODE_GROUP_LENGTH}}$`
);

/**
 * Formats raw keystrokes/paste input into `XXXX-XXXX-XXXX-XXXX`:
 * uppercases, drops characters that are not valid AT THEIR POSITION (the
 * first 12 must be in the body alphabet, which excludes 0/O/1/I/L; the
 * last 4 are the hex checksum, 0-9 A-F — see REDEEM_CHECKSUM_ALPHABET),
 * silently eats punctuation/whitespace, inserts a dash after every 4
 * characters, and caps at 16 characters total.
 */
export function formatRedeemInput(raw: string): string {
  const kept: string[] = [];
  for (const ch of raw.toUpperCase()) {
    if (kept.length >= REDEEM_CODE_MAX_CHARS) break;
    const allowed = kept.length < BODY_CHARS ? ALPHABET_SET : CHECKSUM_SET;
    if (allowed.has(ch)) kept.push(ch);
  }
  const cleaned = kept.join("");

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
