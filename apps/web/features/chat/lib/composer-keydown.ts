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
 *
 * Post-4d bugfix round — MOBILE ENTER BUG: a phone's on-screen keyboard
 * fires a normal, non-composing `Enter` keydown (`isComposing: false`,
 * `keyCode` often 13, sometimes not even 229) for its own "return"/
 * newline key. Neither existing guard catches this — from the DOM's
 * point of view it is indistinguishable from a physical Enter — so the
 * composer sent the message every time a mobile user tried to start a
 * new line, with no way to type a multi-line message at all. Product
 * requirement: on a touch/virtual-keyboard device, Enter should ONLY
 * insert a newline; sending happens exclusively via the Send button.
 * Desktop keeps Enter-to-send / Shift+Enter-for-newline unchanged.
 * `isCoarsePointer` is the caller's answer to "is this a touch device"
 * (see composer.tsx's `matchMedia("(pointer: coarse)")` check) — kept as
 * an injected boolean, not read from `window` in here, so this function
 * stays a pure, DOM-free unit (same reason `isComposing`/`keyCode` are
 * passed in rather than read off a real event).
 *
 * KNOWN TRADEOFF (documented, not silently swallowed): a 2-in-1/iPad
 * with a physical keyboard still reports a coarse pointer, so Enter
 * won't send there either — the user must tap Send. Acceptable: it's a
 * strict improvement over the previous "always sends, can't type a
 * newline on any touch device" bug, and there's no DOM signal that
 * distinguishes "coarse pointer, typing via a physical keyboard right
 * now" from "coarse pointer, typing via the on-screen one".
 */
export interface KeydownLike {
  key: string;
  shiftKey: boolean;
  /** `KeyboardEvent.isComposing` — true during an active IME composition. */
  isComposing: boolean;
  /** Legacy but load-bearing for Safari; 229 = "IME processing". */
  keyCode: number;
  /** True on a touch/coarse-pointer device (virtual keyboard). When true,
   *  Enter never sends — only the Send button does. Defaults to `false`
   *  so every pre-existing call site/test keeps desktop behavior. */
  isCoarsePointer?: boolean;
}

export function shouldSendOnKeydown(e: KeydownLike): boolean {
  if (e.key !== "Enter") return false;
  if (e.shiftKey) return false; // Shift+Enter inserts a newline
  if (e.isComposing || e.keyCode === 229) return false;
  if (e.isCoarsePointer) return false; // mobile/touch: Enter = newline only
  return true;
}
