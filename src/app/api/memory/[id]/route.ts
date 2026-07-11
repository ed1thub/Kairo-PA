import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { memoryUpdateInputSchema } from "@/tools/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, workspace } = await getCurrentUser();
  const { id } = await params;
  const body = await request.json();

  const parsed = memoryUpdateInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const updates = parsed.data;
  if (Object.keys(updates).length === 0) return new NextResponse("No editable fields provided", { status: 400 });

  const db = getDb();
  const [updated] = await db
    .update(memories)
    .set(updates)
    .where(and(eq(memories.id, id), eq(memories.userId, user.id)))
    .returning();
  if (!updated) return new NextResponse("Not found", { status: 404 });

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "memory.edit",
    status: "completed",
    resourceType: "memory",
    resourceId: id,
    channel: "web",
  });

  return NextResponse.json({ memory: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, workspace } = await getCurrentUser();
  const { id } = await params;
  const db = getDb();
  const [deleted] = await db
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, user.id)))
    .returning();
  if (!deleted) return new NextResponse("Not found", { status: 404 });

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "memory.delete",
    status: "completed",
    resourceType: "memory",
    resourceId: id,
    channel: "web",
  });

  return NextResponse.json({ deleted: true });
}
