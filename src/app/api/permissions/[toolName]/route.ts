import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { toolPermissions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ toolName: string }> }) {
  const { user, workspace } = await getCurrentUser();
  const { toolName } = await params;
  const body = await request.json();

  const db = getDb();
  const [existing] = await db
    .select()
    .from(toolPermissions)
    .where(and(eq(toolPermissions.userId, user.id), eq(toolPermissions.toolName, toolName)))
    .limit(1);
  if (!existing) return new NextResponse("Not found", { status: 404 });

  const updates: { enabled?: boolean; requiresConfirmation?: boolean } = {};
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body.requiresConfirmation === "boolean") updates.requiresConfirmation = body.requiresConfirmation;

  await db
    .update(toolPermissions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(toolPermissions.id, existing.id));

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "permission.update",
    toolName,
    status: "completed",
    resourceType: "tool_permission",
    resourceId: existing.id,
    channel: "web",
    details: updates,
  });

  return NextResponse.json({ updated: true });
}
