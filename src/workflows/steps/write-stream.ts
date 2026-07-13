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

/**
 * Marks this turn's response stream as complete and closes it. Each web
 * chat request gets its own bounded workflow run (see conversation.ts), so
 * without this the HTTP response for that request never ends: useChat's
 * transport only reconnects when a request's stream ends without a "finish"
 * chunk, so a stream that neither writes "finish" nor closes leaves the
 * composer disabled forever (see docs/ASSUMPTIONS.md).
 */
export async function finishStream() {
  "use step";
  const writable = getWritable<UIMessageChunk>();
  const writer = writable.getWriter();
  await writer.write({ type: "finish" });
  await writer.close();
}
