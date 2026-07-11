import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pendingActions } from "@/db/schema";
import { getBot } from "@/bot/chat-instance";
import { buildConfirmationCard } from "@/bot/confirmation-card";
import type { Channel, RiskLevel } from "@/lib/audit";

const CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export interface CreatePendingActionInput {
  userId: string;
  workspaceId: string;
  conversationId?: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskLevel: RiskLevel;
  requestedVia: Channel;
}

export async function createPendingAction(input: CreatePendingActionInput): Promise<string> {
  "use step";
  const db = getDb();
  const [row] = await db
    .insert(pendingActions)
    .values({
      userId: input.userId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      toolName: input.toolName,
      toolArgs: input.toolArgs,
      riskLevel: input.riskLevel,
      requestedVia: input.requestedVia,
      expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
    })
    .returning();
  return row.id;
}

/**
 * Conditional on `status = 'pending'` so two concurrent approve/reject
 * requests for the same action (e.g. a double-click, or a client retry)
 * can't both win — only the first caller's write actually lands, and it
 * returns whether THIS call was the one that resolved it. Callers should
 * skip resuming the workflow hook when this returns false, since another
 * request already did (or is about to).
 */
export async function resolvePendingAction(pendingActionId: string, approved: boolean): Promise<boolean> {
  "use step";
  const db = getDb();
  const [updated] = await db
    .update(pendingActions)
    .set({ status: approved ? "approved" : "rejected", resolvedAt: new Date() })
    .where(and(eq(pendingActions.id, pendingActionId), eq(pendingActions.status, "pending")))
    .returning();
  return updated !== undefined;
}

export async function expirePendingAction(pendingActionId: string) {
  "use step";
  const db = getDb();
  await db
    .update(pendingActions)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(eq(pendingActions.id, pendingActionId));
}

/**
 * Surfaces a pending confirmation to the user on their channel. Telegram
 * gets an inline-button Card; the web UI picks up the pending row via
 * GET /api/confirmations (polled by the chat UI) rather than a stream
 * data-part, keeping this step simple.
 */
export async function notifyConfirmationRequired(params: {
  channel: Channel;
  telegramChannelId?: string;
  pendingActionId: string;
  toolName: string;
  riskLevel: RiskLevel;
  summary: string;
}) {
  "use step";
  if (params.channel === "telegram" && params.telegramChannelId) {
    await getBot()
      .channel(params.telegramChannelId)
      .post(
        buildConfirmationCard({
          pendingActionId: params.pendingActionId,
          toolName: params.toolName,
          riskLevel: params.riskLevel,
          summary: params.summary,
        }),
      )
      .catch(() => {
        // Best-effort — the web /activity and /integrations confirmation
        // list are still authoritative even if the Telegram push fails.
      });
  }
}
