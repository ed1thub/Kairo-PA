import { defineHook } from "workflow";
import { z } from "zod";

/**
 * Injects a new user turn into an already-running conversation workflow.
 * Token is deterministic (`conversation:{conversationId}`) so both the web
 * API routes and the Telegram webhook handler can resume the same
 * conversation without knowing its underlying workflow run ID.
 */
export const conversationMessageHook = defineHook({
  schema: z.object({
    content: z.string().min(1),
    channel: z.enum(["web", "telegram"]),
    // Set when channel is "telegram" — tells the workflow where to deliver
    // its reply, since Telegram (unlike the web UI) has no open HTTP
    // response to stream the reply back through.
    telegramChannelId: z.string().optional(),
  }),
});
