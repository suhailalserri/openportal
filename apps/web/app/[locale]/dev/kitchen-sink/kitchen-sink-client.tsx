"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bell, Moon, Sun, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ChatSidebar, type ChatSidebarConversation } from "@/components/chat/chat-sidebar";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/features/chat/components/message/message-list";
import type { ChatMessage, ChatError } from "@/features/chat/types";

const demoFormSchema = z.object({
  displayName: z.string().min(2, "At least 2 characters."),
  bio: z.string().max(160, "Keep it under 160 characters.").optional(),
});

function DemoForm() {
  const form = useForm<z.infer<typeof demoFormSchema>>({
    resolver: zodResolver(demoFormSchema),
    defaultValues: { displayName: "", bio: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => alert(JSON.stringify(values, null, 2)))}
        className="grid max-w-sm gap-4"
      >
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input placeholder="فراس" {...field} />
              </FormControl>
              <FormDescription>Shown on your profile.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <Textarea placeholder="Petroleum engineering M.Sc. student..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}

/* ── Color tokens ───────────────────────────────────────────────────
 * One row per semantic pair defined in styles/theme.css. Renders via
 * live Tailwind utility classes (which resolve the CSS custom
 * properties at paint time), not a hardcoded hex list, so this tab
 * stays accurate automatically if a token value ever changes.
 */
const COLOR_TOKENS: { label: string; bg: string; fg: string; note?: string }[] = [
  { label: "background / foreground", bg: "bg-background", fg: "text-foreground" },
  { label: "card / card-foreground", bg: "bg-card", fg: "text-card-foreground" },
  { label: "popover / popover-foreground", bg: "bg-popover", fg: "text-popover-foreground" },
  { label: "primary / primary-foreground", bg: "bg-primary", fg: "text-primary-foreground" },
  { label: "secondary / secondary-foreground", bg: "bg-secondary", fg: "text-secondary-foreground" },
  { label: "muted / muted-foreground", bg: "bg-muted", fg: "text-muted-foreground" },
  { label: "accent / accent-foreground", bg: "bg-accent", fg: "text-accent-foreground" },
  {
    label: "accent-strong / accent-foreground",
    bg: "bg-accent-strong",
    fg: "text-accent-foreground",
    note: "added this session — switch.tsx's checked track",
  },
  { label: "destructive / destructive-foreground", bg: "bg-destructive", fg: "text-destructive-foreground" },
  { label: "success / success-foreground", bg: "bg-success", fg: "text-success-foreground" },
  { label: "warning / warning-foreground", bg: "bg-warning", fg: "text-warning-foreground" },
  { label: "info / info-foreground", bg: "bg-info", fg: "text-info-foreground" },
  { label: "sidebar / sidebar-foreground", bg: "bg-sidebar", fg: "text-sidebar-foreground" },
  {
    label: "sidebar-accent / sidebar-accent-foreground",
    bg: "bg-sidebar-accent",
    fg: "text-sidebar-accent-foreground",
  },
];

function ColorSwatches() {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {COLOR_TOKENS.map((t) => (
        <div
          key={t.label}
          className={`flex h-24 flex-col justify-between rounded-lg border border-border p-3 ${t.bg} ${t.fg}`}
        >
          <span className="text-xs font-medium">{t.label}</span>
          {t.note && <span className="text-[10px] opacity-80">{t.note}</span>}
        </div>
      ))}
    </section>
  );
}

function TypographyScale() {
  return (
    <section className="space-y-4">
      <p className="t-h1 text-foreground">عنوان رئيسي — t-h1</p>
      <p className="t-h2 text-foreground">عنوان فرعي — t-h2</p>
      <p className="t-h3 text-foreground">عنوان صغير — t-h3</p>
      <p className="t-body text-foreground">
        نص أساسي — t-body. رقم الطلب <span dir="ltr">#12345</span> ثابت الاتجاه داخل الفقرة.
      </p>
      <p className="t-small text-foreground">نص ثانوي أصغر — t-small</p>
      <p className="t-caption text-foreground">تسمية توضيحية — t-caption</p>
      <p className="t-mono">const creditsRemaining = 2_670_000_000; // t-mono</p>
    </section>
  );
}

function ToastDemos() {
  return (
    <section className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => toast("إشعار عام (default)")}>
        Default
      </Button>
      <Button
        variant="secondary"
        className="text-success"
        onClick={() => toast.success("تم الحفظ بنجاح")}
      >
        Success
      </Button>
      <Button
        variant="secondary"
        className="text-destructive"
        onClick={() => toast.error("تعذّر الاتصال بالخادم")}
      >
        Error
      </Button>
      <Button
        variant="secondary"
        className="text-accent-foreground"
        onClick={() => toast.warning("رصيدك على وشك النفاد")}
      >
        Warning
      </Button>
      <Button
        variant="secondary"
        className="text-accent-foreground"
        onClick={() => toast.info("تم تحديث النموذج المتاح")}
      >
        Info
      </Button>
    </section>
  );
}

/* ── Chat surface ──────────────────────────────────────────────────
 * chat-sidebar.tsx and composer.tsx (still presentational-only, 4c/4d's
 * scope) composed with the REAL features/chat/components/message/*
 * (Phase 4a) — message-bubble.tsx and message-actions.tsx, which used
 * to live here, are deleted; MessageList/Message/ErrorMessage are their
 * replacement (see features/chat/types.ts's header comment for why the
 * message shape and the error-as-a-message modeling both changed).
 * Local state only; no tRPC/IndexedDB wiring (that's Phase 4b/4d/7 per
 * the master plan).
 *
 * Known gap surfaced here, not fixed here: chat-sidebar.tsx and
 * composer.tsx still use hardcoded Arabic strings (labels, aria-labels,
 * empty states) rather than next-intl — so this tab renders the same
 * Arabic copy for those two under both /en/ and /ar/. That's consistent
 * with their own "real data/i18n wiring is a later phase" scope (4c/4d),
 * but worth knowing before assuming /en/dev/kitchen-sink is fully
 * localized. The message list itself (4a, this phase) IS fully i18n'd.
 */
const DEMO_CONVERSATIONS: ChatSidebarConversation[] = [
  { id: "c1", title: "رفع حد الطلبات اليومي", isActive: true },
  { id: "c2", title: "مقارنة GPT-4o و Claude Opus" },
  { id: "c3", title: "خطأ 429 عند البث" },
];

const DEMO_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "كيف أرفع حد الطلبات اليومي؟",
    createdAt: "2026-09-21T10:02:00.000Z",
    isPartial: false,
  },
  {
    id: "m2",
    role: "assistant",
    content: "يمكنك رفعه من الإعدادات ← الفوترة. رقم طلبك الحالي هو 12345.",
    createdAt: "2026-09-21T10:02:20.000Z",
    isPartial: false,
    modelId: "gpt-4o",
    inputTokens: 18,
    outputTokens: 24,
    creditCost: 900_000,
  },
  {
    id: "m4",
    role: "assistant",
    content: "بالتأكيد، إليك الخطوات الأولى قبل أن ينقطع",
    createdAt: "2026-09-21T10:04:00.000Z",
    isPartial: true,
    modelId: "gpt-4o",
  },
];

const DEMO_ERROR: ChatError = {
  id: "m3-err",
  message: "تعذّر الاتصال بمزوّد النموذج. حاول مرة أخرى.",
  retryable: true,
};

function ChatSurface() {
  const [conversations, setConversations] = React.useState(DEMO_CONVERSATIONS);
  const [activeId, setActiveId] = React.useState(DEMO_CONVERSATIONS[0]!.id);
  const [search, setSearch] = React.useState("");
  const [composerValue, setComposerValue] = React.useState("");
  const [showError, setShowError] = React.useState(true);

  const filtered = conversations
    .map((c) => ({ ...c, isActive: c.id === activeId }))
    .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="flex h-[520px] overflow-hidden rounded-xl border border-border bg-background shadow-1">
      <ChatSidebar
        className="w-[240px] shrink-0 border-e border-border"
        conversations={filtered}
        searchQuery={search}
        onSearchChange={setSearch}
        onNewChat={() => toast.success("محادثة جديدة (demo)")}
        onSelectConversation={setActiveId}
        onDeleteConversation={(id) => {
          setConversations((cs) => cs.filter((c) => c.id !== id));
          toast("تم حذف المحادثة (demo)");
        }}
        userName="فراس السعدي"
        planLabel="Pro"
        creditsLabel="2,670"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <MessageList
          className="flex-1 px-5 py-4"
          messages={DEMO_MESSAGES}
          error={showError ? DEMO_ERROR : undefined}
          onCopy={() => toast("تم النسخ (demo)")}
          onRegenerate={() => toast("إعادة المحاولة (demo)")}
          onFeedback={() => toast("شكراً على ملاحظتك (demo)")}
          onRetryError={() => setShowError(false)}
        />

        <div className="border-t border-border p-3">
          <Composer
            value={composerValue}
            onChange={setComposerValue}
            onSend={() => {
              if (!composerValue.trim()) return;
              toast.success(`تم الإرسال (demo): ${composerValue}`);
              setComposerValue("");
            }}
            placeholder="اكتب رسالتك..."
            metaLeft="120 / 8,000 tokens"
            metaRight="GPT-4o"
          />
        </div>
      </div>
    </section>
  );
}

function ThemeQuickToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {mounted ? (resolvedTheme === "dark" ? "Light" : "Dark") : "Theme"}
    </Button>
  );
}

export function KitchenSinkClient() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kitchen Sink</h1>
          <p className="text-sm text-muted-foreground">
            Dev-only (404s in production). Every design token, primitive and the Session
            &quot;restyle&quot; chat components in one place — verify here in /ar/ and /en/, both
            themes, before trusting any of it downstream.
          </p>
        </div>
        <ThemeQuickToggle />
      </div>

      <Tabs defaultValue="colors">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="colors">Colors</TabsTrigger>
            <TabsTrigger value="typography">Typography</TabsTrigger>
            <TabsTrigger value="inputs">Inputs</TabsTrigger>
            <TabsTrigger value="overlays">Overlays</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="layout">Layout &amp; Data</TabsTrigger>
            <TabsTrigger value="form">Form</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Colors ──────────────────────────────────────────────── */}
        <TabsContent value="colors" className="space-y-6 pt-4">
          <ColorSwatches />
        </TabsContent>

        {/* ── Typography ──────────────────────────────────────────── */}
        <TabsContent value="typography" className="space-y-6 pt-4">
          <TypographyScale />
        </TabsContent>

        {/* ── Inputs ──────────────────────────────────────────────── */}
        <TabsContent value="inputs" className="space-y-6 pt-4">
          <section className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </section>

          <section className="grid max-w-sm gap-3">
            <Input placeholder="اكتب رسالتك..." />
            <Textarea placeholder="Textarea — Arabic + code mix: نص عربي مع code" />
            <Select defaultValue="gpt-4o">
              <SelectTrigger>
                <SelectValue placeholder="اختر النموذج" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="claude-opus">Claude Opus</SelectItem>
                <SelectItem value="deepseek-r2">DeepSeek R2</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch id="switch-demo" />
              <label htmlFor="switch-demo" className="text-sm text-foreground">
                Enable notifications
              </label>
            </div>
          </section>
        </TabsContent>

        {/* ── Overlays ────────────────────────────────────────────── */}
        <TabsContent value="overlays" className="space-y-6 pt-4">
          <section className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>محادثة جديدة</DialogTitle>
                  <DialogDescription>This should center and fade/zoom in both themes.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button>Confirm</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete…</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Open Sheet (end)</Button>
              </SheetTrigger>
              <SheetContent side="end">
                <SheetHeader>
                  <SheetTitle>Settings</SheetTitle>
                  <SheetDescription>
                    Slides from the true trailing edge — left in RTL, right in LTR. Flip the page
                    direction and reopen to check.
                  </SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Open Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Billing</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <Trash2 /> Delete account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Bell /> Hover me
                </Button>
              </TooltipTrigger>
              <TooltipContent>You have 3 new alerts</TooltipContent>
            </Tooltip>
          </section>
        </TabsContent>

        {/* ── Feedback ────────────────────────────────────────────── */}
        <TabsContent value="feedback" className="space-y-6 pt-4">
          <section className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="outline">Outline</Badge>
          </section>
          <section className="grid max-w-sm gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </section>
          <section className="space-y-2">
            <p className="t-small text-muted-foreground">
              Toasts render via the global AppToastProvider (providers/toast-provider.tsx) —
              bottom-center, both directions, per-type color coding on the leading edge.
            </p>
            <ToastDemos />
          </section>
        </TabsContent>

        {/* ── Chat ────────────────────────────────────────────────── */}
        <TabsContent value="chat" className="space-y-3 pt-4">
          <p className="t-small text-muted-foreground">
            components/chat/{"{"}chat-sidebar, composer{"}"}.tsx (4c/4d, still presentational) +
            features/chat/components/message/{"{"}message-list, message, message-actions,
            error-message{"}"}.tsx (4a, real). Local state only — search filters client-side,
            send/copy/regenerate/feedback/delete just toast. Sidebar shows the active-row +
            hover-reveal delete; message list shows a normal turn, an error turn, and an
            interrupted/partial turn.
          </p>
          <ChatSurface />
        </TabsContent>

        {/* ── Layout & Data ───────────────────────────────────────── */}
        <TabsContent value="layout" className="space-y-6 pt-4">
          <section className="flex items-center gap-4">
            <Avatar>
              <AvatarImage src="/nonexistent.png" alt="" />
              <AvatarFallback>فر</AvatarFallback>
            </Avatar>
            <Separator orientation="vertical" className="h-8" />
            <Card className="w-64">
              <CardHeader>
                <CardTitle>رصيدك</CardTitle>
                <CardDescription>2,670 credits</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Card token check — border/shadow/radius should match the Gateway preset.
              </CardContent>
            </Card>
          </section>

          <ScrollArea className="h-32 w-64 rounded-md border border-border p-3">
            {Array.from({ length: 20 }).map((_, i) => (
              <p key={i} className="text-sm text-foreground">
                Scrollable row {i + 1}
              </p>
            ))}
          </ScrollArea>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Input / 1k</TableHead>
                <TableHead>Output / 1k</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>GPT-4o</TableCell>
                <TableCell>12 credits</TableCell>
                <TableCell>36 credits</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Claude Opus</TableCell>
                <TableCell>18 credits</TableCell>
                <TableCell>54 credits</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TabsContent>

        {/* ── Form ────────────────────────────────────────────────── */}
        <TabsContent value="form" className="pt-4">
          <DemoForm />
        </TabsContent>
      </Tabs>
    </main>
  );
}
