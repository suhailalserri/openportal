"use client";

import { useTranslations } from "next-intl";

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
 */
export function SettingsView() {
  const t = useTranslations("settings.nav");
  const sections = getVisibleSections();
  const firstId = sections[0]?.id;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-6">
      <h1 className="text-xl font-semibold text-foreground">{t("pageTitle")}</h1>

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
    </div>
  );
}
