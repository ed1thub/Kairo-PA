import { createUIMessageStreamResponse } from "ai";
import type { ModelMessage } from "ai";
import { start } from "workflow/api";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations, messages as messagesTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { conversationWorkflow } from "@/workflows/conversation";
import { getModelName } from "@/lib/llm";

const MODEL_HEADER = { "x-model": getModelName() };

interface ChatRequestBody {
  conversationId: string;
  message: string;
}

export async function POST(request: Request) {
  const { user, workspace } = await getCurrentUser();
  const { conversationId, message } = (await request.json()) as ChatRequestBody;

  if (!conversationId || !message?.trim()) {
    return new Response("conversationId and message are required", { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)))
    .limit(1);

  let priorMessages: ModelMessage[] = [];

  if (!existing) {
    // First message of a brand-new conversation — the client generates the
    // conversation id up front so we can create the row with that exact id.
    await db.insert(conversations).values({
      id: conversationId,
      userId: user.id,
      workspaceId: workspace.id,
      channel: "web",
      title: message.slice(0, 80),
    });
  } else {
    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.createdAt));
    priorMessages = rows.map(
      (row) => ({ role: row.role, content: row.content }) as ModelMessage,
    );
  }

  // Each message gets its own workflow run scoped to a single turn, with
  // history reloaded from the messages table — see conversation.ts for why.
  const run = await start(conversationWorkflow, [
    conversationId,
    user.id,
    workspace.id,
    priorMessages,
    { content: message, channel: "web" as const },
  ]);

  await db
    .update(conversations)
    .set({ workflowRunId: run.runId })
    .where(eq(conversations.id, conversationId));

  return createUIMessageStreamResponse({
    stream: run.readable,
    headers: { "x-workflow-run-id": run.runId, ...MODEL_HEADER },
  });
}
