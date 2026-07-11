import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { reminders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { reminderCreate } from "@/tools/reminders";
import { reminderCreateInputSchema } from "@/tools/schemas";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, user.id))
    .orderBy(desc(reminders.dueAt));
  return NextResponse.json({ reminders: rows });
}

export async function POST(request: Request) {
  const { user, workspace } = await getCurrentUser();
  const body = await request.json();
  const input = reminderCreateInputSchema.parse(body);

  const result = await reminderCreate(user.id, workspace.id, input);

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "reminder.create",
    status: "completed",
    resourceType: "reminder",
    resourceId: result.reminderId,
    channel: "web",
    details: { title: input.title, dueAt: input.dueAt },
  });

  return NextResponse.json(result);
}
