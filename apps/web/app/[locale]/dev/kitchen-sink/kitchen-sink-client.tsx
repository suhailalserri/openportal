"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bell, Trash2 } from "lucide-react";

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

export function KitchenSinkClient() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Kitchen Sink</h1>
        <p className="text-sm text-muted-foreground">
          Dev-only (404s in production). Every Phase 1.2 primitive, one place — verify here in
          /ar/ and /en/, both themes, before trusting any of it downstream.
        </p>
      </div>

      <Tabs defaultValue="inputs">
        <TabsList>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="overlays">Overlays</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="layout">Layout &amp; Data</TabsTrigger>
          <TabsTrigger value="form">Form</TabsTrigger>
        </TabsList>

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
