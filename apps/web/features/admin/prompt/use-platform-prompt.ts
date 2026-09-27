"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

/**
 * apps/web/features/admin/prompt/use-platform-prompt.ts
 *
 * Loads and saves the single platform-wide base system prompt
 * (platform-config.router.ts / packages/db/src/schema/platform-config.ts).
 * This is one of the two layers of the server-owned system prompt — the
 * other, per-model, is edited from the /admin/models edit form instead
 * (see features/admin/models/components/model-form-dialog.tsx). Neither
 * layer is ever visible to or editable by end users.
 *
 * Local draft state + explicit Save (not autosave/debounced-PATCH like the
 * old per-conversation prompt used to be) — this affects EVERY
 * conversation on the platform the moment it's saved, so an accidental
 * keystroke should never silently go live.
 */
export function usePlatformPrompt() {
  const utils = trpc.useUtils();
  const query = trpc.platformConfig.get.useQuery();
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data.basePrompt);
  }, [query.data, dirty]);

  const update = trpc.platformConfig.update.useMutation({
    onSuccess: async () => {
      toast.success("Saved");
      setDirty(false);
      await utils.platformConfig.get.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save");
    },
  });

  return {
    draft,
    setDraft: (next: string) => {
      setDraft(next);
      setDirty(true);
    },
    isLoading:  query.isLoading,
    isError:    query.isError,
    refetch:    query.refetch,
    save:       () => update.mutateAsync({ basePrompt: draft }),
    isSaving:   update.isPending,
    saveError:  update.error,
    dirty,
  };
}
