import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ActionStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "requires_confirmation";
export type ConfirmationStatus = "not_required" | "pending" | "approved" | "rejected" | "expired";
export type Channel = "web" | "telegram" | "cron";

export interface AuditLogInput {
  userId: string;
  workspaceId: string;
  action: string;
  status: ActionStatus;
  toolName?: string;
  resourceType?: string;
  resourceId?: string;
  riskLevel?: RiskLevel;
  confirmationStatus?: ConfirmationStatus;
  requestId?: string;
  // Redacted, non-sensitive context only. Never include raw message content,
  // full attendee lists, document text, or other sensitive payloads here.
  details?: Record<string, unknown>;
  channel?: Channel;
}

/**
 * The single write path for audit_logs. Every tool call, permission check,
 * and confirmation event must go through this function (never insert into
 * audit_logs directly) so nothing is missed and the shape stays consistent.
 *
 * Marked "use step": it's called both from plain API routes (runs normally
 * there) and from workflow-level code (src/lib/tool-runtime.ts) — without
 * this directive, the Neon client's module code gets bundled directly into
 * the workflow's sandboxed VM, which is missing Node/web globals (e.g.
 * EventTarget) the client needs at import time.
 */
export async function writeAuditLog(input: AuditLogInput) {
  "use step";
  const db = getDb();
  await db.insert(auditLogs).values({
    userId: input.userId,
    workspaceId: input.workspaceId,
    action: input.action,
    status: input.status,
    toolName: input.toolName,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    riskLevel: input.riskLevel,
    confirmationStatus: input.confirmationStatus,
    requestId: input.requestId ?? crypto.randomUUID(),
    details: input.details,
    channel: input.channel,
  });
}
