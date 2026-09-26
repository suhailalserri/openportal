"use client";

import { useTranslations } from "next-intl";

import { SectionPage } from "@/components/layout/section-page";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { getVisibleSections } from "./registry";

/**
 * apps/web/features/settings/index.tsx (Phase 7.1)
 *
 * Single consumer of `registry.ts`'s visible-sections list, rendered two
 * ways from the same data so a section is never wired into one layout
 * and forgotten in the other:
 *  - `md:` and up: Tabs (underline style, matches `usage`/`dashboard`).
 *  - below `md`: Accordion, first section open by default.
 *
 * Both layouts mount every visible section's component up front (Radix
 * Tabs/Accordion keep inactive content in the DOM rather than unmounting
 * it), which is what lets `useFormDirtyGuard` in each section survive a
 * tab/accordion switch — see that hook's own comment.
 *
 * Frame: this used to be its own `mx-auto max-w-2xl py-6` div with NO
 * horizontal padding, unlike every other page in the app (dashboard,
 * billing, usage), which all go through `SectionPage` (`p-4 md:p-8`).
 * The gap read as accordion titles/inputs sitting flush against the
 * screen edge on mobile ("texts starting next to the border of the
 * screen"). Now wrapped in `SectionPage` like the rest so the side
 * margins match every other page at every breakpoint. `max-w-2xl` is
 * passed through `className` (resolved over `SectionPage`'s own
 * `max-w-5xl` via `cn()`'s tailwind-merge) to keep this page's original,
 * narrower form-width — only the missing padding was the bug, not the
 * width cap.
 */
export function SettingsView() {
  const t = useTranslations("settings.nav");
  const sections = getVisibleSections();
  // registry.test.ts asserts profile+security are always visible, so
  // sections[0] always exists in practice; the `?? ""` is only here to
  // satisfy `exactOptionalPropertyTypes` (Tabs/Accordion's `defaultValue`
  // is `string`, not `string | undefined` — passing `undefined` through
  // explicitly is a type error under that flag even though the prop
  // itself is optional).
  const firstId = sections[0]?.id ?? "";

  return (
    <SectionPage title={t("pageTitle")} className="max-w-2xl">
      {/* Desktop / tablet */}
      <Tabs defaultValue={firstId} className="hidden md:flex">
        <TabsList>
          {sections.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {t(s.titleKey)}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((s) => {
          const Section = s.component!;
          return (
            <TabsContent key={s.id} value={s.id} className="pt-4">
              <Section />
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Mobile */}
      <Accordion
        type="single"
        collapsible
        defaultValue={firstId}
        className="flex flex-col md:hidden"
      >
        {sections.map((s) => {
          const Section = s.component!;
          return (
            <AccordionItem key={s.id} value={s.id}>
              <AccordionTrigger>{t(s.titleKey)}</AccordionTrigger>
              <AccordionContent>
                <Section />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </SectionPage>
  );
}
