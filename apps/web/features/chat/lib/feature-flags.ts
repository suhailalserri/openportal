/**
 * apps/web/features/chat/lib/feature-flags.ts
 *
 * P6.3d. The three P6.3 features (attachments, voice input, structured stream / thinking) are switched
 * by an admin in /admin/features and apply to every user. This turns the server answer (`user.features`)
 * into the booleans the chat uses. FAIL CLOSED: while loading, on an error, or for anything that is not
 * a literal `true`, the feature is OFF, so a slow or broken endpoint hides a feature and never breaks chat.
 */
export interface ChatFeatures {
  attachments: boolean;
  voice: boolean;
  thinking: boolean;
}

export const CHAT_FEATURES_OFF: ChatFeatures = { attachments: false, voice: false, thinking: false };

export function toChatFeatures(data: unknown): ChatFeatures {
  if (typeof data !== "object" || data === null) return CHAT_FEATURES_OFF;
  const d = data as Record<string, unknown>;
  return {
    attachments: d.attachments === true,
    voice: d.voice === true,
    thinking: d.thinking === true,
  };
}
