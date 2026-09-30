/**
 * P6.5: may a model be offered tools / asked for reasoning? Pure: no db, config or network.
 *
 * The answer comes only from the admin-curated `models.categories` flags that already exist
 * (`functionCalling`, `reasoning`, see MODEL_CATEGORY_KEYS in @ai-platform/config). A flag is an
 * admin's claim, backed by the gateway spike (docs/runbooks/TOOL_SPIKE.md); nothing sets it
 * automatically. Nothing in /chat calls this yet: the request still never sends `tools`.
 */
import { TRANSCRIPTION_CATEGORY } from "./transcription.policy";

export const FUNCTION_CALLING_CATEGORY = "functionCalling";
export const REASONING_CATEGORY = "reasoning";

type Categories = readonly string[] | null | undefined;

/** A speech-to-text model is never a chat model, whatever else its flags say. */
function isChatModel(categories: Categories): categories is readonly string[] {
  return Array.isArray(categories) && !categories.includes(TRANSCRIPTION_CATEGORY);
}

/** True only when an admin marked the model `functionCalling`. Unknown, empty or missing means no. */
export function modelSupportsTools(categories: Categories): boolean {
  return isChatModel(categories) && categories.includes(FUNCTION_CALLING_CATEGORY);
}

/** True only when an admin marked the model `reasoning`. Unknown, empty or missing means no. */
export function modelSupportsReasoning(categories: Categories): boolean {
  return isChatModel(categories) && categories.includes(REASONING_CATEGORY);
}
