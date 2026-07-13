import type { Chat } from "chat";
import type { ModelMessage } from "ai";
import { customAlphabet } from "nanoid";
import { eq, and, asc, desc } from "drizzle-orm";
import { put } from "@vercel/blob";
import { start } from "workflow/api";
import { getDb } from "@/db/client";
import { telegramLinks, conversations, workspaces, documents, pendingActions, messages as messagesTable } from "@/db/schema";
import { conversationWorkflow } from "@/workflows/conversation";
import { confirmationHook } from "@/workflows/hooks/confirmation";
import { resolvePendingAction } from "@/workflows/steps/confirmation";
import { ingestDocumentWorkflow } from "@/workflows/ingest-document";
import { SUPPORTED_DOCUMENT_MIME_TYPES } from "@/lib/file-parsers";
import { writeAuditLog } from "@/lib/audit";

// Unambiguous uppercase alphanumeric (no 0/O/1/I) — read out easily, typed by hand.
const generateLinkCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Registers all Telegram event handlers on a freshly-constructed `Chat`
 * instance. Called once by `getBot()` — never import this module for its
 * side effects directly, since handler registration must happen exactly
 * once per instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerHandlers(bot: Chat<any>) {
  bot.onSlashCommand("/start", async (event) => {
    const channelId = event.channel.id;
    const db = getDb();

    const [existing] = await db
      .select()
      .from(telegramLinks)
      .where(eq(telegramLinks.telegramChatId, channelId))
      .limit(1);

    if (existing?.status === "linked") {
      await event.channel.post("This chat is already linked to your Kairo account.");
      return;
    }

    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

    if (existing) {
      await db
        .update(telegramLinks)
        .set({ linkCode: code, linkCodeExpiresAt: expiresAt, telegramUsername: event.user.userName })
        .where(eq(telegramLinks.id, existing.id));
    } else {
      await db.insert(telegramLinks).values({
        telegramChatId: channelId,
        telegramUsername: event.user.userName,
        linkCode: code,
        linkCodeExpiresAt: expiresAt,
        status: "pending",
      });
    }

    await event.channel.post(
      `Welcome to Kairo. To link this chat to your account, sign in to the web dashboard, open Integrations, and enter this code:\n\n${code}\n\nIt expires in 10 minutes.`,
    );
  });

  bot.onDirectMessage(async (thread, message, channel) => {
    const channelId = channel.id;
    const db = getDb();

    const [link] = await db
      .select()
      .from(telegramLinks)
      .where(eq(telegramLinks.telegramChatId, channelId))
      .limit(1);

    if (!link || link.status !== "linked" || !link.userId) {
      await thread.post("This chat isn't linked to a Kairo account yet. Send /start to get a linking code.");
      return;
    }

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, link.userId))
      .limit(1);
    if (!workspace) {
      await thread.post("Your account isn't fully set up yet. Please try again in a moment.");
      return;
    }

    const supportedAttachments = (message.attachments ?? []).filter(
      (a) => a.mimeType && SUPPORTED_DOCUMENT_MIME_TYPES.has(a.mimeType),
    );
    if (supportedAttachments.length > 0) {
      for (const attachment of supportedAttachments) {
        if (!attachment.fetchData) continue;
        const data = await attachment.fetchData();
        const filename = attachment.name ?? "telegram-upload";
        const blob = await put(`documents/${link.userId}/${crypto.randomUUID()}-${filename}`, data, {
          access: "private",
          contentType: attachment.mimeType,
        });

        const [document] = await db
          .insert(documents)
          .values({
            userId: link.userId,
            workspaceId: workspace.id,
            filename,
            mimeType: attachment.mimeType!,
            sourceChannel: "telegram",
            blobUrl: blob.url,
            sizeBytes: attachment.size,
          })
          .returning();

        await start(ingestDocumentWorkflow, [document.id]);
      }
      await thread.post(
        `Got it, indexing ${supportedAttachments.length === 1 ? "that file" : `${supportedAttachments.length} files`}. Ask me about it once it's ready (check Documents in the web dashboard for status).`,
      );
      if (!message.text.trim()) return;
    }

    const [existingConversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, link.userId), eq(conversations.channel, "telegram")))
      .orderBy(desc(conversations.createdAt))
      .limit(1);

    let conversationId: string;
    let priorMessages: ModelMessage[] = [];

    if (!existingConversation) {
      const [conversation] = await db
        .insert(conversations)
        .values({
          userId: link.userId,
          workspaceId: workspace.id,
          channel: "telegram",
          title: message.text.slice(0, 80),
        })
        .returning();
      conversationId = conversation.id;
    } else {
      conversationId = existingConversation.id;
      const rows = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversationId))
        .orderBy(asc(messagesTable.createdAt));
      priorMessages = rows.map((row) => ({ role: row.role, content: row.content }) as ModelMessage);
    }

    // Each message gets its own workflow run scoped to a single turn, with
    // history reloaded from the messages table — see conversation.ts for why.
    const run = await start(conversationWorkflow, [
      conversationId,
      link.userId,
      workspace.id,
      priorMessages,
      { content: message.text, channel: "telegram" as const, telegramChannelId: channelId },
    ]);

    await db.update(conversations).set({ workflowRunId: run.runId }).where(eq(conversations.id, conversationId));
  });

  bot.onAction(["confirm_approve", "confirm_reject"], async (event) => {
    const pendingActionId = event.value;
    const approved = event.actionId === "confirm_approve";
    if (!pendingActionId) return;

    const db = getDb();
    const [pendingAction] = await db
      .select()
      .from(pendingActions)
      .where(eq(pendingActions.id, pendingActionId))
      .limit(1);

    if (!pendingAction || pendingAction.status !== "pending") {
      await event.thread?.post("This confirmation is no longer pending.");
      return;
    }

    // resolvePendingAction's UPDATE is itself conditional on status='pending',
    // so a double-tap can't also win this race — only resume the workflow
    // hook if this call was the one that actually resolved it.
    const resolved = await resolvePendingAction(pendingActionId, approved);
    if (!resolved) {
      await event.thread?.post("This confirmation is no longer pending.");
      return;
    }
    await confirmationHook.resume(`confirmation:${pendingActionId}`, { approved });

    await writeAuditLog({
      userId: pendingAction.userId,
      workspaceId: pendingAction.workspaceId,
      action: approved ? "confirmation.approved" : "confirmation.rejected",
      toolName: pendingAction.toolName,
      riskLevel: pendingAction.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      status: approved ? "completed" : "cancelled",
      confirmationStatus: approved ? "approved" : "rejected",
      resourceType: "pending_action",
      resourceId: pendingActionId,
      channel: "telegram",
    });

    await event.thread?.post(approved ? "✅ Approved." : "❌ Rejected.");
  });
}
