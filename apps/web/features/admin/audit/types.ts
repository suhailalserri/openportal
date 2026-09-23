import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@ai-platform/api/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type AuditLogPage = RouterOutputs["admin"]["listAuditLogs"];
export type AuditLogItem = AuditLogPage["items"][number];
