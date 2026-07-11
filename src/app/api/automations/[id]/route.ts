import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { automations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, workspace } = await getCurrentUser();
  const { id } = await params;
  const body = await request.json();

  const db = getDb();
  const [automation] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.userId, user.id)))
    .limit(1);
  if (!automation) return new NextResponse("Not found", { status: 404 });

  if (typeof body.enabled === "boolean") {
    await db.update(automations).set({ enabled: body.enabled }).where(eq(automations.id, id));
    await writeAuditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: body.enabled ? "automation.enable" : "automation.pause",
      status: "completed",
      resourceType: "automation",
      resourceId: id,
      channel: "web",
    });
    return NextResponse.json({ enabled: body.enabled });
  }

  return new NextResponse("Unsupported update", { status: 400 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, workspace } = await getCurrentUser();
  const { id } = await params;
  const db = getDb();
  const [automation] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.userId, user.id)))
    .limit(1);
  if (!automation) return new NextResponse("Not found", { status: 404 });

  await db.delete(automations).where(eq(automations.id, id));
  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "automation.delete",
    status: "completed",
    resourceType: "automation",
    resourceId: id,
    channel: "web",
  });

  return NextResponse.json({ deleted: true });
}
