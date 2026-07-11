import type { ModelMessage } from "ai";
import { getBot } from "@/bot/chat-instance";

function extractText(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export async function deliverAssistantReplyToTelegram(
  telegramChannelId: string,
  newMessages: ModelMessage[],
) {
  "use step";
  const text = newMessages
    .filter((m) => m.role === "assistant")
    .map((m) => extractText(m.content))
    .join("\n\n")
    .trim();

  if (!text) return;
  await getBot().channel(telegramChannelId).post(text);
}
