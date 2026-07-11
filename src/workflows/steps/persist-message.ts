import { eq } from "drizzle-orm";
import type { ModelMessage } from "ai";
import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";

function extractText(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export async function persistUserMessage(conversationId: string, content: string) {
  "use step";
  const db = getDb();
  await db.insert(messages).values({ conversationId, role: "user", content });
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}

/**
 * Persists the new assistant/tool messages produced by a single agent turn.
 * `newMessages` should be the slice of `result.messages` not already known
 * to the caller (i.e. everything after the just-added user message).
 */
export async function persistAgentTurn(conversationId: string, newMessages: ModelMessage[]) {
  "use step";
  const db = getDb();
  for (const message of newMessages) {
    if (message.role === "user") continue; // already persisted by persistUserMessage
    const text = extractText(message.content);
    if (!text) continue; // skip pure tool-call/tool-result messages for now (no tools in V1)
    await db.insert(messages).values({ conversationId, role: message.role, content: text });
  }
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}
