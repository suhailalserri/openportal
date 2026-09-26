/**
 * Fallback for the `@modal` parallel-route slot on every URL that isn't
 * one of the intercepted auth routes below (i.e. almost all of them) —
 * parallel routes require a `default.tsx` for whatever a slot renders
 * when nothing more specific matched, or Next 404s the whole layout.
 */
export default function ModalSlotDefault() {
  return null;
}
