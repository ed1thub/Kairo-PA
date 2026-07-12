import { createUIMessageStreamResponse } from "ai";
import { start, getRun } from "workflow/api";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { conversationWorkflow } from "@/workflows/conversation";
import { conversationMessageHook } from "@/workflows/hooks/conversation-message";
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

    const run = await start(conversationWorkflow, [
      conversationId,
      user.id,
      workspace.id,
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

  if (!existing.workflowRunId) {
    return new Response("Conversation has no active workflow run", { status: 409 });
  }

  const run = getRun(existing.workflowRunId);
  const tailIndexBeforeResume = await run.getReadable().getTailIndex();

  await conversationMessageHook.resume(`conversation:${conversationId}`, {
    content: message,
    channel: "web",
  });

  return createUIMessageStreamResponse({
    stream: run.getReadable({ startIndex: tailIndexBeforeResume + 1 }),
    headers: { "x-workflow-run-id": run.runId, ...MODEL_HEADER },
  });
}
