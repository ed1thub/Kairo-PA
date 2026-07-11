import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { toolPermissions } from "@/db/schema";
import { claimIdempotencyKey } from "@/lib/idempotency";
import { writeAuditLog, type Channel, type RiskLevel } from "@/lib/audit";
import { requiresConfirmation } from "@/lib/risk-policy";
import { createPendingAction, notifyConfirmationRequired } from "@/workflows/steps/confirmation";
import { confirmationHook } from "@/workflows/hooks/confirmation";

export class ToolDisabledError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is disabled for this user`);
    this.name = "ToolDisabledError";
  }
}

export class DuplicateActionError extends Error {
  constructor(toolName: string) {
    super(`Duplicate call to "${toolName}" — already processed`);
    this.name = "DuplicateActionError";
  }
}

export class ActionRejectedError extends Error {
  constructor(toolName: string) {
    super(`User rejected the confirmation for "${toolName}"`);
    this.name = "ActionRejectedError";
  }
}

export interface RunToolOptions<T> {
  userId: string;
  workspaceId: string;
  toolName: string;
  riskLevel: RiskLevel;
  channel: Channel;
  requestId: string;
  conversationId?: string;
  telegramChannelId?: string;
  resourceType?: string;
  /** Present only for mutating tools — enforces at-most-once execution. */
  idempotencyKey?: string;
  /** The tool's parsed input — stored on pending_actions for the confirmation card and audit log. */
  toolArgs?: Record<string, unknown>;
  /** Human-readable one-liner shown on the confirmation card/prompt. */
  confirmationSummary?: string;
  /** Redacted context for the audit log — never raw message content. */
  auditDetails?: Record<string, unknown>;
  execute: () => Promise<T>;
}

interface ToolPermissionState {
  enabled: boolean;
  requiresConfirmation: boolean | null;
}

/**
 * Marked "use step" for the same reason as writeAuditLog/claimIdempotencyKey
 * — runTool() runs at the workflow level, and the Neon client's module code
 * can't evaluate inside the workflow sandbox without this.
 */
async function getToolPermissionState(userId: string, toolName: string): Promise<ToolPermissionState> {
  "use step";
  const db = getDb();
  const [permission] = await db
    .select()
    .from(toolPermissions)
    .where(and(eq(toolPermissions.userId, userId), eq(toolPermissions.toolName, toolName)))
    .limit(1);
  // No explicit row yet = default-allow, default-require-confirmation
  // (matches the tool_permissions.requires_confirmation DB column default).
  if (!permission) return { enabled: true, requiresConfirmation: null };
  return { enabled: permission.enabled, requiresConfirmation: permission.requiresConfirmation };
}

/**
 * The single execution path every tool must go through: permission check →
 * confirmation gate (risk-level-based) → idempotency check → execute →
 * audit log (doc 14 rules 5, 9, 10, 11; plan section 6/12).
 */
export async function runTool<T>(options: RunToolOptions<T>): Promise<T> {
  const permissionState = await getToolPermissionState(options.userId, options.toolName);

  if (!permissionState.enabled) {
    await writeAuditLog({
      userId: options.userId,
      workspaceId: options.workspaceId,
      action: "tool.execute",
      toolName: options.toolName,
      riskLevel: options.riskLevel,
      status: "failed",
      requestId: options.requestId,
      channel: options.channel,
      details: { reason: "tool_disabled" },
    });
    throw new ToolDisabledError(options.toolName);
  }

  const needsConfirmation = requiresConfirmation(options.riskLevel, permissionState.requiresConfirmation);

  if (needsConfirmation) {
    const pendingActionId = await createPendingAction({
      userId: options.userId,
      workspaceId: options.workspaceId,
      conversationId: options.conversationId,
      toolName: options.toolName,
      toolArgs: options.toolArgs ?? {},
      riskLevel: options.riskLevel,
      requestedVia: options.channel,
    });

    await writeAuditLog({
      userId: options.userId,
      workspaceId: options.workspaceId,
      action: "confirmation.requested",
      toolName: options.toolName,
      riskLevel: options.riskLevel,
      status: "requires_confirmation",
      confirmationStatus: "pending",
      requestId: options.requestId,
      channel: options.channel,
      resourceType: "pending_action",
      resourceId: pendingActionId,
    });

    await notifyConfirmationRequired({
      channel: options.channel,
      telegramChannelId: options.telegramChannelId,
      pendingActionId,
      toolName: options.toolName,
      riskLevel: options.riskLevel,
      summary: options.confirmationSummary ?? `Run ${options.toolName}?`,
    });

    using hook = confirmationHook.create({ token: `confirmation:${pendingActionId}` });
    const { approved } = await hook;

    if (!approved) {
      await writeAuditLog({
        userId: options.userId,
        workspaceId: options.workspaceId,
        action: "tool.execute",
        toolName: options.toolName,
        riskLevel: options.riskLevel,
        status: "cancelled",
        confirmationStatus: "rejected",
        requestId: options.requestId,
        channel: options.channel,
        resourceType: options.resourceType,
      });
      throw new ActionRejectedError(options.toolName);
    }
  }

  if (options.idempotencyKey) {
    const claimed = await claimIdempotencyKey(`${options.toolName}:${options.idempotencyKey}`);
    if (!claimed) {
      await writeAuditLog({
        userId: options.userId,
        workspaceId: options.workspaceId,
        action: "tool.execute",
        toolName: options.toolName,
        riskLevel: options.riskLevel,
        status: "cancelled",
        confirmationStatus: needsConfirmation ? "approved" : "not_required",
        requestId: options.requestId,
        channel: options.channel,
        details: { reason: "duplicate_action" },
      });
      throw new DuplicateActionError(options.toolName);
    }
  }

  await writeAuditLog({
    userId: options.userId,
    workspaceId: options.workspaceId,
    action: "tool.execute",
    toolName: options.toolName,
    riskLevel: options.riskLevel,
    status: "in_progress",
    confirmationStatus: needsConfirmation ? "approved" : "not_required",
    requestId: options.requestId,
    channel: options.channel,
    resourceType: options.resourceType,
    details: options.auditDetails,
  });

  try {
    const result = await options.execute();
    await writeAuditLog({
      userId: options.userId,
      workspaceId: options.workspaceId,
      action: "tool.execute",
      toolName: options.toolName,
      riskLevel: options.riskLevel,
      status: "completed",
      confirmationStatus: needsConfirmation ? "approved" : "not_required",
      requestId: options.requestId,
      channel: options.channel,
      resourceType: options.resourceType,
    });
    return result;
  } catch (error) {
    await writeAuditLog({
      userId: options.userId,
      workspaceId: options.workspaceId,
      action: "tool.execute",
      toolName: options.toolName,
      riskLevel: options.riskLevel,
      status: "failed",
      confirmationStatus: needsConfirmation ? "approved" : "not_required",
      requestId: options.requestId,
      channel: options.channel,
      resourceType: options.resourceType,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
