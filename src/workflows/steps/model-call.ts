import { generateText } from "ai";
import type { ModelMessage, ToolSet } from "ai";
import { getChatModel, buildSystemPrompt } from "@/lib/llm";
import { TOOL_DESCRIPTORS } from "@/tools/registry";

export interface ModelCallToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ModelCallResult {
  responseMessages: ModelMessage[];
  toolCalls: ModelCallToolCall[];
}

/**
 * The model is constructed fresh inside this step (never passed in as an
 * argument) so no function value ever crosses a workflow/step boundary —
 * see the note in src/tools/registry.ts for why. Tools are passed WITHOUT
 * `execute` — this step only plans the next action; actual tool execution
 * happens at the workflow level via src/tools/registry.ts::executeTool so
 * future confirmation gating (Phase 5) can suspend the workflow on a hook.
 */
export async function callModel(messages: ModelMessage[]): Promise<ModelCallResult> {
  "use step";

  const tools: ToolSet = Object.fromEntries(
    Object.entries(TOOL_DESCRIPTORS).map(([name, def]) => [
      name,
      { description: def.description, inputSchema: def.inputSchema },
    ]),
  );

  const result = await generateText({
    model: getChatModel(),
    system: buildSystemPrompt(),
    messages,
    tools,
  });

  const response = await result.response;

  return {
    responseMessages: response.messages,
    toolCalls: result.toolCalls.map((tc) => ({
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      input: tc.input,
    })),
  };
}
