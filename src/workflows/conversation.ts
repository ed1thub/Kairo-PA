import type { ModelMessage } from "ai";
import { persistUserMessage, persistAgentTurn } from "./steps/persist-message";
import { deliverAssistantReplyToTelegram } from "./steps/deliver-telegram";
import { callModel } from "./steps/model-call";
import { writeAssistantText, finishStream } from "./steps/write-stream";
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
      await writeAssistantText(text, round === 0);
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
 * One workflow run per turn. Both the web UI and Telegram call `start()`
 * with this turn's message plus the conversation's prior history (loaded
 * from the `messages` table by the caller) — the workflow itself owns no
 * state across turns. This keeps each web request's response stream bounded
 * (it closes when this turn's reply is done, see finishStream()) rather
 * than tied to a run that stays suspended indefinitely awaiting the next
 * message, which left the chat composer permanently disabled after the
 * first message.
 */
export async function conversationWorkflow(
  conversationId: string,
  userId: string,
  workspaceId: string,
  priorMessages: ModelMessage[],
  turn: ConversationTurn,
) {
  "use workflow";

  await persistUserMessage(conversationId, turn.content);
  const modelMessages: ModelMessage[] = [...priorMessages, { role: "user", content: turn.content }];

  const requestId = crypto.randomUUID();
  const newMessages = await runAgentTurn(
    userId,
    workspaceId,
    conversationId,
    turn.channel,
    turn.telegramChannelId,
    requestId,
    modelMessages,
  );
  await persistAgentTurn(conversationId, newMessages);

  if (turn.channel === "telegram" && turn.telegramChannelId) {
    await deliverAssistantReplyToTelegram(turn.telegramChannelId, newMessages);
  }

  await finishStream();
}
