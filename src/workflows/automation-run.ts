import { loadAutomationForRun, markAutomationRun } from "./steps/automation";
import { executeTool } from "@/tools/registry";

interface AutomationAction {
  toolName: string;
  input: unknown;
}

/**
 * One workflow run per scheduled automation trigger. Executes each action
 * through the same executeTool() path a chat-driven tool call uses, so
 * confirmation gating (Phase 5) and audit logging apply identically to
 * automated actions as to agent-initiated ones (doc 3.5, 3.11).
 */
export async function automationRunWorkflow(automationId: string) {
  "use workflow";

  const loaded = await loadAutomationForRun(automationId);
  if (!loaded) return;

  const { automation, workspaceId } = loaded;
  const requestId = crypto.randomUUID();
  const actions = (automation.actions as AutomationAction[]) ?? [];

  for (const action of actions) {
    try {
      await executeTool({
        userId: automation.userId,
        workspaceId,
        channel: "cron",
        requestId,
        toolName: action.toolName,
        input: action.input,
      });
    } catch {
      // One failed action shouldn't block the rest of the automation's
      // steps — failures are already captured per-tool-call in the audit
      // log via executeTool/runTool.
    }
  }

  await markAutomationRun(automationId);
}
