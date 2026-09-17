"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Dialog       = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose   = DialogPrimitive.Close;
export const DialogPortal  = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-40 bg-black/60",
      "data-[state=open]:animate-fade-in",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* Was `fixed z-50` with no top/left/transform — centered, sized, and
        shaped here so any future consumer gets a working dialog out of the
        box and only needs to override what's actually different about it. */}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        "w-[calc(100vw-2rem)] max-w-md max-h-[85vh] overflow-y-auto",
        "bg-[color:var(--bg-surface)] border border-slate-700/80 rounded-2xl p-6",
        "shadow-[var(--shadow-elevation-3)] focus:outline-none",
        "data-[state=open]:animate-scale-in",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

export const DialogTitle       = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
