/**
 * Sidebar / drawer navigation (Phase 2.1). Single source of truth for
 * every shell nav entry; the UI (components/layout/*) only renders what
 * getNavGroups() returns.
 *
 * - `href` is locale-less ("/chat"); the UI prefixes `/{locale}`.
 * - `labelKey` is a key in the `nav` message namespace.
 * - `enabled: false` renders the entry as a disabled "soon" row. The
 *   phase that builds the route flips it to true (comment on each entry
 *   says which). nav.test.ts fails if an entry is enabled while its
 *   route has no page file, so a nav link can never point at a 404.
 * - Filtering by role here only decides what the shell SHOWS (Rule 4:
 *   client checks are UX). Access is enforced by the (admin) layout guard
 *   and by the `admin.*` procedures on the server.
 *
 * Pure module (relative imports only, no React) so vitest can load it.
 */
import { ADMIN_ROLES, normalizeRole, type AppRole } from "../lib/roles";

export type NavIconName =
  | "chat"
  | "billing"
  | "dashboard"
  | "usage"
  | "settings"
  | "adminOverview"
  | "users"
  | "codes"
  | "packages"
  | "paymentMethods"
  | "manualPayments"
  | "models"
  | "channels"
  | "fraud"
  | "logs"
  | "audit";

export interface NavItem {
  id: string;
  /** Locale-less path, e.g. "/chat". */
  href: string;
  /** Key in the `nav` message namespace. */
  labelKey: string;
  icon: NavIconName;
  /** false → rendered as a disabled "soon" row until its phase lands. */
  enabled: boolean;
  /** Active only on an exact path match (default: also on sub-paths). */
  exact?: boolean;
}

export interface NavGroup {
  id: "main" | "admin";
  /** Key in the `nav` namespace for the group heading; omit for none. */
  labelKey?: string;
  /** Roles that see this group; omit for everyone. */
  roles?: readonly AppRole[];
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "main",
    items: [
      // "chat" deliberately absent (Phase 4d Patch v2): AppSidebar/
      // MobileDrawer now embed the conversation list itself, which
      // already links to /chat via its own New Chat button and row
      // clicks — a second "Chat" entry here would point at the same
      // place and add nothing.
      // 5.1 — wallet + redeem (landed)
      { id: "billing", href: "/billing", labelKey: "billing", icon: "billing", enabled: true },
      // 6.1 — dashboard (landed)
      { id: "dashboard", href: "/dashboard", labelKey: "dashboard", icon: "dashboard", enabled: true },
      // 6.2
      { id: "usage", href: "/usage", labelKey: "usage", icon: "usage", enabled: false },
      // 7.1
      { id: "settings", href: "/settings", labelKey: "settings", icon: "settings", enabled: false },
    ],
  },
  {
    id: "admin",
    labelKey: "admin",
    roles: ADMIN_ROLES,
    items: [
      // Placeholder page exists since 2.1. 8a/8c decide whether this
      // stays an overview or becomes /admin/dashboard.
      {
        id: "adminOverview",
        href: "/admin",
        labelKey: "adminOverview",
        icon: "adminOverview",
        enabled: true,
        exact: true,
      },
      // 8b — money ops
      { id: "adminUsers", href: "/admin/users", labelKey: "adminUsers", icon: "users", enabled: false },
      { id: "adminCodes", href: "/admin/codes", labelKey: "adminCodes", icon: "codes", enabled: false },
      { id: "adminPackages", href: "/admin/packages", labelKey: "adminPackages", icon: "packages", enabled: false },
      {
        id: "adminPaymentMethods",
        href: "/admin/payment-methods",
        labelKey: "adminPaymentMethods",
        icon: "paymentMethods",
        enabled: false,
      },
      {
        id: "adminManualPayments",
        href: "/admin/manual-payments",
        labelKey: "adminManualPayments",
        icon: "manualPayments",
        enabled: false,
      },
      // 8c — ops
      { id: "adminModels", href: "/admin/models", labelKey: "adminModels", icon: "models", enabled: false },
      { id: "adminChannels", href: "/admin/channels", labelKey: "adminChannels", icon: "channels", enabled: false },
      { id: "adminFraud", href: "/admin/fraud", labelKey: "adminFraud", icon: "fraud", enabled: false },
      { id: "adminLogs", href: "/admin/logs", labelKey: "adminLogs", icon: "logs", enabled: false },
      { id: "adminAudit", href: "/admin/audit", labelKey: "adminAudit", icon: "audit", enabled: false },
    ],
  },
];

/**
 * Groups visible to `role`. Unknown / missing roles are treated as a
 * plain user (fails closed — never shows the admin group by accident).
 */
export function getNavGroups(role: unknown): NavGroup[] {
  const normalized = normalizeRole(role);
  return NAV_GROUPS.filter((group) => !group.roles || group.roles.includes(normalized));
}

const LOCALE_PREFIX = /^\/(ar|en)(?=\/|$)/;

/**
 * `pathname` is the browser path INCLUDING the locale ("/ar/chat/abc").
 * Sub-paths count as active (/chat/abc → Chat) unless the item is
 * `exact` (so /admin/users never lights up the /admin overview).
 */
export function isNavItemActive(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  let path = pathname.replace(LOCALE_PREFIX, "") || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === item.href) return true;
  if (item.exact) return false;
  return path.startsWith(`${item.href}/`);
}
