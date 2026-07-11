import { eq, and } from "drizzle-orm";
import { RRule } from "rrule";
import { getDb } from "@/db/client";
import { reminders, telegramLinks } from "@/db/schema";
import { getBot } from "@/bot/chat-instance";

export async function loadReminder(reminderId: string) {
  "use step";
  const db = getDb();
  const [reminder] = await db.select().from(reminders).where(eq(reminders.id, reminderId)).limit(1);
  return reminder ?? null;
}

/**
 * Delivers a due reminder and advances it to its next state: 'completed'
 * for one-time reminders, or re-armed with the next `due_at` (computed via
 * RRULE) and left 'planned' for recurring ones.
 */
export async function deliverReminder(reminderId: string) {
  "use step";
  const db = getDb();
  const [reminder] = await db.select().from(reminders).where(eq(reminders.id, reminderId)).limit(1);
  if (!reminder || reminder.status !== "planned") return;

  if (reminder.deliveryChannel === "telegram" || reminder.deliveryChannel === "both") {
    const [link] = await db
      .select()
      .from(telegramLinks)
      .where(and(eq(telegramLinks.userId, reminder.userId), eq(telegramLinks.status, "linked")))
      .limit(1);
    if (link) {
      await getBot()
        .channel(link.telegramChatId)
        .post(`Reminder: ${reminder.title}`)
        .catch(() => {
          // Best-effort — a delivery failure shouldn't crash the workflow;
          // the reminder still shows as due in the web /reminders list.
        });
    }
  }

  if (reminder.recurrenceRule) {
    try {
      const rule = RRule.fromString(reminder.recurrenceRule);
      const next = rule.after(reminder.dueAt, false);
      if (next) {
        await db.update(reminders).set({ dueAt: next }).where(eq(reminders.id, reminderId));
        return;
      }
    } catch {
      // Invalid RRULE — fall through and treat as one-time.
    }
  }

  await db.update(reminders).set({ status: "completed" }).where(eq(reminders.id, reminderId));
}
