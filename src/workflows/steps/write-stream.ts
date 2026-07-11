import { getWritable } from "workflow";
import { generateId } from "ai";
import type { UIMessageChunk } from "ai";

/**
 * Writes one assistant text turn to the conversation's UI message stream.
 * Not token-level streaming (the whole message appears at once) — a
 * documented V1 simplification, see docs/ASSUMPTIONS.md Phase 3.
 */
export async function writeAssistantText(text: string, sendStart: boolean) {
  "use step";
  if (!text) return;

  const writable = getWritable<UIMessageChunk>();
  const writer = writable.getWriter();
  const textId = generateId();
  try {
    if (sendStart) {
      await writer.write({ type: "start", messageId: generateId() });
    }
    await writer.write({ type: "text-start", id: textId });
    await writer.write({ type: "text-delta", id: textId, delta: text });
    await writer.write({ type: "text-end", id: textId });
  } finally {
    writer.releaseLock();
  }
}
