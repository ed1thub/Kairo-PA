import { sleep } from "workflow";
import { loadReminder, deliverReminder } from "./steps/deliver-reminder";

/**
 * One workflow run per reminder. Sleeps until `due_at`, delivers, and — for
 * recurring reminders — loops back to sleep until the next occurrence
 * (computed by deliverReminder via RRULE). Cancelling a reminder
 * (src/tools/reminders.ts::reminderCancel) wakes the sleep early so this
 * notices the cancellation instead of firing anyway.
 */
export async function reminderWorkflow(reminderId: string) {
  "use workflow";

  for (;;) {
    const reminder = await loadReminder(reminderId);
    if (!reminder || reminder.status !== "planned") return;

    const delayMs = reminder.dueAt.getTime() - Date.now();
    if (delayMs > 0) {
      await sleep(`${Math.ceil(delayMs / 1000)}s`);
    }

    const stillPlanned = await loadReminder(reminderId);
    if (!stillPlanned || stillPlanned.status !== "planned") return;

    await deliverReminder(reminderId);

    const after = await loadReminder(reminderId);
    if (!after || after.status !== "planned" || !after.recurrenceRule) return;
    // else: loop back and sleep until the next occurrence deliverReminder set.
  }
}
