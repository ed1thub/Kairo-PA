import { defineHook } from "workflow";
import { z } from "zod";

/**
 * Resolves a pending confirmation. Token is deterministic
 * (`confirmation:{pendingActionId}`) so the approve/reject API routes can
 * resume it without knowing the underlying workflow run.
 */
export const confirmationHook = defineHook({
  schema: z.object({
    approved: z.boolean(),
  }),
});
