import type { UIMessage } from "ai";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations, messages as messagesTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ChatPanel } from "@/components/chat/chat-panel";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { user } = await getCurrentUser();

  const db = getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)))
    .limit(1);

  let initialMessages: UIMessage[] = [];
  if (conversation) {
    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.createdAt));
    initialMessages = rows
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({
        id: row.id,
        role: row.role as "user" | "assistant",
        parts: [{ type: "text", text: row.content }],
      }));
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Chat" description="Talk to Kairo." />
      <ChatPanel conversationId={conversationId} initialMessages={initialMessages} />
    </div>
  );
}
