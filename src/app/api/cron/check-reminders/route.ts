import { NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { start } from "workflow/api";
import { getDb } from "@/db/client";
import { reminders } from "@/db/schema";
import { verifyCronRequest } from "@/lib/cron-auth";
import { reminderWorkflow } from "@/workflows/reminder";

// Safety net only — sleep() inside reminderWorkflow is the primary delivery
// mechanism. This defensively re-triggers reminders that are overdue by
// more than 5 minutes, which can only happen if their workflow run was
// somehow lost (not the normal path).
const OVERDUE_THRESHOLD_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const cutoff = new Date(Date.now() - OVERDUE_THRESHOLD_MS);
  const overdue = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.status, "planned"), lt(reminders.dueAt, cutoff)));

  for (const reminder of overdue) {
    await start(reminderWorkflow, [reminder.id]);
  }

  return NextResponse.json({ retriggered: overdue.length });
}
