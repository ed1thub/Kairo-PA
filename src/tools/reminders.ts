import type { z } from "zod";
import { eq, and } from "drizzle-orm";
import { start, getRun } from "workflow/api";
import { getDb } from "@/db/client";
import { reminders } from "@/db/schema";
import { reminderWorkflow } from "@/workflows/reminder";
import type {
  reminderCreateInputSchema,
  reminderListInputSchema,
  reminderCancelInputSchema,
} from "./schemas";

export async function reminderCreate(
  userId: string,
  workspaceId: string,
  input: z.infer<typeof reminderCreateInputSchema>,
) {
  "use step";
  const db = getDb();
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) throw new Error("Invalid dueAt datetime");

  const [reminder] = await db
    .insert(reminders)
    .values({
      userId,
      workspaceId,
      title: input.title,
      dueAt,
      recurrenceRule: input.recurrenceRule,
      deliveryChannel: input.deliveryChannel,
    })
    .returning();

  const run = await start(reminderWorkflow, [reminder.id]);
  await db.update(reminders).set({ workflowRunId: run.runId }).where(eq(reminders.id, reminder.id));

  return { reminderId: reminder.id, title: reminder.title, dueAt: reminder.dueAt.toISOString() };
}

export async function reminderList(userId: string, input: z.infer<typeof reminderListInputSchema>) {
  "use step";
  const db = getDb();
  const conditions = [eq(reminders.userId, userId)];
  if (input.status) conditions.push(eq(reminders.status, input.status));
  const rows = await db
    .select()
    .from(reminders)
    .where(and(...conditions));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dueAt: r.dueAt.toISOString(),
    status: r.status,
    recurrenceRule: r.recurrenceRule,
  }));
}

export async function reminderCancel(userId: string, input: z.infer<typeof reminderCancelInputSchema>) {
  "use step";
  const db = getDb();
  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, input.reminderId), eq(reminders.userId, userId)))
    .limit(1);
  if (!reminder) throw new Error("Reminder not found");

  await db.update(reminders).set({ status: "cancelled" }).where(eq(reminders.id, reminder.id));

  // Interrupt the sleeping workflow so it notices the cancellation instead
  // of waiting for the full delay to elapse.
  if (reminder.workflowRunId) {
    await getRun(reminder.workflowRunId)
      .wakeUp()
      .catch(() => {
        // Run may have already finished — nothing to wake.
      });
  }

  return { reminderId: reminder.id, status: "cancelled" as const };
}
