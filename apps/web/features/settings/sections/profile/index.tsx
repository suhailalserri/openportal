"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FormErrorBanner } from "@/components/auth/form-error-banner";
import { useFormDirtyGuard } from "../../hooks/use-form-dirty-guard";

const profileSchema = z.object({
  displayName: z.string().max(100).optional().or(z.literal("")),
});
type ProfileValues = z.infer<typeof profileSchema>;

function initialsOf(name: string | null | undefined, email: string): string {
  const source = (name ?? "").trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const chars = parts.length >= 2 ? [parts[0]![0], parts[1]![0]] : [source[0] ?? "?"];
  return chars.join("").toUpperCase();
}

/**
 * apps/web/features/settings/sections/profile/index.tsx (Phase 7.1)
 *
 * No avatar upload (D8-adjacent — the plan never scopes one for
 * Settings and no storage/upload path exists anywhere in this repo
 * yet): the avatar is always an initials fallback, derived from
 * `displayName` (falling back to `email`) — never uploaded, so
 * `AvatarImage` is never rendered here, only `AvatarFallback`.
 *
 * Email is read-only (`user.getProfile.email`) — changing it isn't a
 * procedure this backend exposes; the plan's own Appendix D / F-list
 * never lists one, so this matches what's actually there rather than
 * building a control against a non-existent mutation.
 */
export function ProfileSection() {
  const t = useTranslations("settings.profile");
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.user.getProfile.useQuery();

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: "" },
  });

  useEffect(() => {
    if (profile) form.reset({ displayName: profile.displayName ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.displayName]);

  useFormDirtyGuard(form.formState.isDirty);

  const update = trpc.user.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.user.getProfile.invalidate();
      form.reset({ displayName: form.getValues("displayName") });
    },
  });

  if (isLoading || !profile) {
    return <Skeleton className="h-48 w-full rounded-[14px]" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarFallback className="text-lg font-semibold">
              {initialsOf(profile.displayName, profile.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{profile.displayName || profile.email}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          </div>
        </div>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => {
              update.mutate({ displayName: values.displayName || undefined });
            })}
          >
            {update.isError && <FormErrorBanner message={t("errors.generic")} />}

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("displayName")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t("displayNamePlaceholder")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-email">{t("email")}</Label>
              <Input id="profile-email" value={profile.email} readOnly disabled />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!form.formState.isDirty || update.isPending}>
                {update.isPending ? t("saving") : t("save")}
              </Button>
            </div>

            {update.isSuccess && !form.formState.isDirty && (
              <p className="text-end text-xs text-success">{t("saved")}</p>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
