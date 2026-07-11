import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { user } = await getCurrentUser();
  const { conversationId } = await params;
  const { searchParams } = new URL(request.url);
  const startIndexParam = searchParams.get("startIndex");

  const db = getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)))
    .limit(1);

  if (!conversation?.workflowRunId) {
    return new Response("Conversation not found", { status: 404 });
  }

  const run = getRun(conversation.workflowRunId);
  const readable = run.getReadable({
    startIndex: startIndexParam ? parseInt(startIndexParam, 10) : undefined,
  });
  const tailIndex = await readable.getTailIndex();

  return createUIMessageStreamResponse({
    stream: readable,
    headers: { "x-workflow-stream-tail-index": String(tailIndex) },
  });
}
