import type { ModelMessage } from "ai";
import { conversationMessageHook } from "./hooks/conversation-message";
import { persistUserMessage, persistAgentTurn } from "./steps/persist-message";
import { deliverAssistantReplyToTelegram } from "./steps/deliver-telegram";
import { callModel } from "./steps/model-call";
import { writeAssistantText } from "./steps/write-stream";
import { executeTool } from "@/tools/registry";

export interface ConversationTurn {
  content: string;
  channel: "web" | "telegram";
  telegramChannelId?: string;
}

const MAX_TOOL_ROUNDS = 5;

function extractText(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/**
 * Runs one full agent turn: model call → (if tool calls) execute tools at
 * the workflow level → feed results back → repeat, up to MAX_TOOL_ROUNDS.
 * Not a step itself — tool dispatch (src/tools/registry.ts::executeTool)
 * happens at this workflow level specifically so future confirmation-gated
 * tools (Phase 5) can suspend on a hook while awaiting user approval.
 */
async function runAgentTurn(
  userId: string,
  workspaceId: string,
  conversationId: string,
  channel: "web" | "telegram",
  telegramChannelId: string | undefined,
  requestId: string,
  workingMessages: ModelMessage[],
  sendStart: boolean,
): Promise<ModelMessage[]> {
  const newMessages: ModelMessage[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { responseMessages, toolCalls } = await callModel(workingMessages);
    workingMessages.push(...responseMessages);
    newMessages.push(...responseMessages);

    const text = responseMessages
      .filter((m) => m.role === "assistant")
      .map((m) => extractText(m.content))
      .join("");
    if (text) {
      await writeAssistantText(text, sendStart && round === 0);
    }

    if (toolCalls.length === 0) break;

    const toolResultParts = [];
    for (const call of toolCalls) {
      let output: unknown;
      try {
        output = await executeTool({
          userId,
          workspaceId,
          channel,
          requestId,
          toolName: call.toolName,
          input: call.input,
          conversationId,
          telegramChannelId,
        });
      } catch (error) {
        output = { error: error instanceof Error ? error.message : String(error) };
      }
      toolResultParts.push({
        type: "tool-result" as const,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: { type: "json" as const, value: output as never },
      });
    }
    const toolMessage: ModelMessage = { role: "tool", content: toolResultParts };
    workingMessages.push(toolMessage);
    newMessages.push(toolMessage);
  }

  return newMessages;
}

/**
 * One workflow run per conversation. Both the web UI and Telegram inject new
 * turns into the SAME run via `conversationMessageHook`, keyed by the
 * deterministic token `conversation:{conversationId}` — this workflow never
 * needs to know which channel a message came from to keep replying.
 */
export async function conversationWorkflow(
  conversationId: string,
  userId: string,
  workspaceId: string,
  initialTurn: ConversationTurn,
) {
  "use workflow";

  using hook = conversationMessageHook.create({ token: `conversation:${conversationId}` });

  const modelMessages: ModelMessage[] = [];
  let pending: ConversationTurn | null = initialTurn;
  let turn = 0;

  while (pending) {
    turn++;
    await persistUserMessage(conversationId, pending.content);
    modelMessages.push({ role: "user", content: pending.content });

    const requestId = crypto.randomUUID();
    const newMessages = await runAgentTurn(
      userId,
      workspaceId,
      conversationId,
      pending.channel,
      pending.telegramChannelId,
      requestId,
      modelMessages,
      turn === 1,
    );
    await persistAgentTurn(conversationId, newMessages);

    if (pending.channel === "telegram" && pending.telegramChannelId) {
      await deliverAssistantReplyToTelegram(pending.telegramChannelId, newMessages);
    }

    pending = await hook;
  }
}
