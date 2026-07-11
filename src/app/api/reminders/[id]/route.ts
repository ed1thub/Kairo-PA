import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { reminders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { reminderCancel } from "@/tools/reminders";
import { writeAuditLog } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, workspace } = await getCurrentUser();
  const { id } = await params;
  const body = await request.json();

  const db = getDb();
  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.userId, user.id)))
    .limit(1);
  if (!reminder) return new NextResponse("Not found", { status: 404 });

  if (body.status === "cancelled") {
    const result = await reminderCancel(user.id, { reminderId: id });
    await writeAuditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "reminder.cancel",
      status: "completed",
      resourceType: "reminder",
      resourceId: id,
      channel: "web",
    });
    return NextResponse.json(result);
  }

  return new NextResponse("Unsupported update", { status: 400 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, workspace } = await getCurrentUser();
  const { id } = await params;
  const db = getDb();
  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.userId, user.id)))
    .limit(1);
  if (!reminder) return new NextResponse("Not found", { status: 404 });

  await db.delete(reminders).where(eq(reminders.id, id));
  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "reminder.delete",
    status: "completed",
    resourceType: "reminder",
    resourceId: id,
    channel: "web",
  });

  return NextResponse.json({ deleted: true });
}
