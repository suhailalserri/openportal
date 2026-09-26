"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { AppProviderIcon, PROVIDER_ICON_OPTIONS } from "@/components/icons/provider-icon";

/**
 * apps/web/features/admin/models/components/provider-icon-picker.tsx
 *
 * Lets an admin browse every provider icon `@lobehub/icons` ships and
 * pick one manually, for when auto-detection (matching `models.provider`
 * against a known key — see components/icons/provider-icon.tsx) doesn't
 * find a confident match, or matches the wrong brand.
 *
 * `value` is the row's `providerIconKey` (admin override, may be
 * `undefined` meaning "auto"). `autoDetectedKey` is what auto-detection
 * would use instead — shown as the "Auto" option's own icon, so the
 * admin can see and confirm what they'd get by NOT overriding anything.
 *
 * No portal/Popover primitive here on purpose: this repo's model picker
 * (features/chat/components/composer/model-picker.tsx) already solved
 * the "custom inline listbox, no Radix" pattern for rich rows (icon +
 * label per option); this reuses the same shape rather than pulling in
 * a new combobox dependency for one form field.
 */
export interface ProviderIconPickerProps {
  value: string | undefined;
  autoDetectedKey: string | undefined;
  onChange: (key: string | undefined) => void;
  label: string;
  autoLabel: string;
  searchPlaceholder: string;
}

export function ProviderIconPicker({
  value,
  autoDetectedKey,
  onChange,
  label,
  autoLabel,
  searchPlaceholder,
}: ProviderIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROVIDER_ICON_OPTIONS;
    return PROVIDER_ICON_OPTIONS.filter(
      (o) => o.label.toLowerCase().includes(q) || o.key.includes(q),
    );
  }, [query]);

  const selected = PROVIDER_ICON_OPTIONS.find((o) => o.key === value);

  function scheduleClose() {
    // Delay so a click on an option (which blurs the input first) still
    // registers before the panel unmounts.
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm outline-none",
          "hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <AppProviderIcon
          providerIconKey={value ?? autoDetectedKey}
          size={16}
        />
        <span className="flex-1 text-start truncate">
          {selected ? selected.label : `${autoLabel}${autoDetectedKey ? ` — ${autoDetectedKey}` : ""}`}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
          onMouseDown={cancelClose}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={scheduleClose}
            placeholder={searchPlaceholder}
            className="w-full border-b border-border bg-transparent px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-secondary",
                value === undefined && "bg-accent",
              )}
            >
              <AppProviderIcon providerIconKey={autoDetectedKey} size={16} />
              <span className="truncate">
                {autoLabel}
                {autoDetectedKey && <span className="text-muted-foreground"> — {autoDetectedKey}</span>}
              </span>
            </button>

            {filtered.map((o) => (
              <button
                key={o.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-secondary",
                  value === o.key && "bg-accent",
                )}
              >
                <AppProviderIcon providerIconKey={o.key} size={16} />
                <span className="truncate">{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">—</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
