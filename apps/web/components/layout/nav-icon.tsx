import {
  Bot,
  Gift,
  BarChart3,
  ClipboardList,
  FlaskConical,
  CreditCard,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { NavIconName } from "@/config/nav";

// config/nav.ts stays free of React so vitest can load it; the icon
// components are looked up here. `Record<NavIconName, …>` makes a missing
// entry a type error the moment a new NavIconName is added.
const ICONS: Record<NavIconName, LucideIcon> = {
  chat: MessageSquare,
  billing: Wallet,
  dashboard: LayoutDashboard,
  usage: BarChart3,
  settings: Settings,
  adminOverview: ShieldCheck,
  users: Users,
  codes: Ticket,
  packages: Package,
  paymentMethods: CreditCard,
  manualPayments: Receipt,
  models: Bot,
  channels: Zap,
  fraud: ShieldAlert,
  logs: ScrollText,
  audit: ClipboardList,
  adminPrompt: MessagesSquare,
  adminWelcomeBonus: Gift,
  adminFeatures: FlaskConical,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string | undefined }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className ?? "size-4 shrink-0"} />;
}
