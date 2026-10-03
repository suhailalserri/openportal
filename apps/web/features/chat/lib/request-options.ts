import { REASONING_EFFORTS, type ConversationParams, type ReasoningEffort } from "../types";

/**
 * apps/web/features/chat/lib/request-options.ts
 *
 * P6.6. Pure helpers for the two request options: reasoning effort and the search switch.
 */

/**
 * The search switch is built, stored and sent, but HIDDEN until P7.2 provides a `web_search` tool.
 * Before that it would do nothing, and a switch with no effect must not ship. P7.2 flips this one
 * constant (and the api starts acting on `webSearch`).
 */
export const WEB_SEARCH_CONTROL_ENABLED = false;

/**
 * Mirrors `modelSupportsReasoning` in apps/api/src/services/model-capabilities.ts: only an admin
 * `reasoning` flag counts, and a speech-to-text model is never a chat model. Duplicated on purpose,
 * the web does not import api services. The api re-checks, this only decides what to SHOW.
 */
export function modelOffersReasoning(categories: readonly string[] | null | undefined): boolean {
  return Array.isArray(categories) && !categories.includes("transcription") && categories.includes("reasoning");
}

/**
 * The request-body fields for the two options. Omitted when unset: the api schema is `.optional()`,
 * not `.nullable()`, so a literal null would be a 400. Model default sends nothing.
 */
export function requestOptionFields(
  params: Pick<ConversationParams, "reasoningEffort" | "webSearch"> | undefined,
): { reasoningEffort?: ReasoningEffort; webSearch?: true } {
  const out: { reasoningEffort?: ReasoningEffort; webSearch?: true } = {};
  const e = params?.reasoningEffort;
  if (e && REASONING_EFFORTS.includes(e)) out.reasoningEffort = e;
  if (WEB_SEARCH_CONTROL_ENABLED && params?.webSearch === true) out.webSearch = true;
  return out;
}

/**
 * Called when the selected model changes: the stored effort belonged to the previous model, so it
 * returns to "model default". Same object back when there is nothing to reset (no state churn).
 */
export function paramsAfterModelChange(params: ConversationParams): ConversationParams {
  return params.reasoningEffort === null ? params : { ...params, reasoningEffort: null };
}
