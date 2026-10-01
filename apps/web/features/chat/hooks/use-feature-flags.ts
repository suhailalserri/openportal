"use client";

import { trpc } from "@/lib/trpc";

import { toChatFeatures, type ChatFeatures } from "../lib/feature-flags";

/**
 * apps/web/features/chat/hooks/use-feature-flags.ts
 *
 * P6.3d. Which chat features the admin has turned on (attachments, voice, thinking), for everyone.
 * Off until the answer arrives and off if the request fails (see lib/feature-flags.ts). Cached for a
 * minute, so a switch an admin flips shows up within about a minute (or on the next page load).
 */
export function useFeatureFlags(): ChatFeatures {
  const query = trpc.user.features.useQuery(undefined, { staleTime: 60_000, retry: false });
  return toChatFeatures(query.data);
}
