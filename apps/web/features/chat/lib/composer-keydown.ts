/**
 * apps/web/features/chat/lib/composer-keydown.ts
 *
 * Phase 4c. Pure decision function for "should this keydown send the
 * message?" — extracted from components/chat/composer.tsx so the IME
 * guard can be unit-tested without a DOM (this repo's vitest runs with
 * `environment: "node"`, no jsdom; see vitest.config.ts's header).
 *
 * WHY THE `isComposing` GUARD EXISTS: while a user is composing text with
 * an IME (Arabic phonetic keyboards, CJK input methods, some mobile
 * keyboards), the Enter key CONFIRMS the composition candidate — it is
 * not a "send" intent. Without this guard, pressing Enter to accept a
 * suggested word submits the half-typed text. The plan calls this out
 * explicitly (FRONTEND_REBUILD_PLAN.md, 4c "Breaks if wrong").
 *
 * TWO signals are checked because browsers disagree:
 *  - `isComposing` is the standard flag.
 *  - `keyCode === 229` is what Safari (and older WebKit) report for the
 *    Enter that ends a composition, because Safari fires `compositionend`
 *    BEFORE the final `keydown`, so `isComposing` is already `false` by
 *    then. Checking only `isComposing` would still misfire on Safari.
 */
export interface KeydownLike {
  key: string;
  shiftKey: boolean;
  /** `KeyboardEvent.isComposing` — true during an active IME composition. */
  isComposing: boolean;
  /** Legacy but load-bearing for Safari; 229 = "IME processing". */
  keyCode: number;
}

export function shouldSendOnKeydown(e: KeydownLike): boolean {
  if (e.key !== "Enter") return false;
  if (e.shiftKey) return false; // Shift+Enter inserts a newline
  if (e.isComposing || e.keyCode === 229) return false;
  return true;
}
