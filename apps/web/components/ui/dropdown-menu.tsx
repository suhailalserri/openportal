"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Thin wrapper around Radix's DropdownMenu, styled for this app's dark
 * glass theme. Replaces the hand-rolled "useState(open) + outside-click
 * useEffect" pattern that was duplicated across ModelSelector,
 * AccountMenu, and LanguageSwitcher.
 *
 * Radix handles: outside-click, Escape, focus trap/return, arrow-key
 * navigation, typeahead, and positioning (flip/shift to stay on-screen).
 * None of that has to be hand-maintained per component anymore.
 *
 * RTL: pass `dir="rtl"` on <Root> when locale is Arabic — Radix's Popper
 * positioning and arrow-key direction both respect it.
 */

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[12rem] overflow-hidden rounded-2xl border border-white/10",
        "bg-white/[0.07] backdrop-blur-xl p-1.5 shadow-[var(--shadow-elevation-3)]",
        "data-[state=open]:animate-slide-up",
        "data-[side=bottom]:slide-in-from-top-1",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    destructive?: boolean;
  }
>(({ className, destructive, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm outline-none",
      "cursor-pointer select-none transition-colors",
      "text-slate-300 focus:bg-white/10 focus:text-white",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      destructive && "text-red-400 focus:bg-red-500/15 focus:text-red-300",
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm outline-none",
      "cursor-pointer select-none transition-colors",
      "text-slate-300 focus:bg-white/10 focus:text-white",
      props.checked && "bg-blue-600/20",
      className
    )}
    {...props}
  >
    <span className="flex-1 min-w-0">{children}</span>
    {props.checked && <Check className="h-4 w-4 shrink-0 text-blue-400" />}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("my-1 h-px bg-white/10", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-3 py-1.5 text-xs font-medium text-slate-500", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";
