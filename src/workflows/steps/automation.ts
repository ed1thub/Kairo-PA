import { eq } from "drizzle-orm";
import { RRule } from "rrule";
import { getDb } from "@/db/client";
import { automations, workspaces } from "@/db/schema";

export async function loadAutomationForRun(automationId: string) {
  "use step";
  const db = getDb();
  const [automation] = await db.select().from(automations).where(eq(automations.id, automationId)).limit(1);
  if (!automation || !automation.enabled) return null;

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, automation.userId))
    .limit(1);
  if (!workspace) return null;

  return { automation, workspaceId: workspace.id };
}

export async function markAutomationRun(automationId: string) {
  "use step";
  const db = getDb();
  const [automation] = await db.select().from(automations).where(eq(automations.id, automationId)).limit(1);
  if (!automation) return;

  let nextRunAt: Date | null = null;
  if (automation.schedule) {
    try {
      const rule = RRule.fromString(automation.schedule);
      nextRunAt = rule.after(automation.nextRunAt ?? new Date(), false);
    } catch {
      nextRunAt = null;
    }
  }

  await db
    .update(automations)
    .set({ lastRunAt: new Date(), nextRunAt })
    .where(eq(automations.id, automationId));
}
