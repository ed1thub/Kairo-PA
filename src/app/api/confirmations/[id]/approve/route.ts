import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pendingActions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { resolvePendingAction } from "@/workflows/steps/confirmation";
import { confirmationHook } from "@/workflows/hooks/confirmation";
import { writeAuditLog } from "@/lib/audit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, workspace } = await getCurrentUser();
  const { id } = await params;

  const db = getDb();
  const [pendingAction] = await db
    .select()
    .from(pendingActions)
    .where(and(eq(pendingActions.id, id), eq(pendingActions.userId, user.id)))
    .limit(1);

  if (!pendingAction) return new NextResponse("Not found", { status: 404 });
  if (pendingAction.status !== "pending") {
    return NextResponse.json({ error: `Already ${pendingAction.status}` }, { status: 409 });
  }

  // resolvePendingAction's UPDATE is itself conditional on status='pending',
  // so a concurrent duplicate request (double-click, client retry) can't
  // also win this race — only resume the workflow hook if this call was
  // the one that actually resolved it.
  const resolved = await resolvePendingAction(id, true);
  if (!resolved) {
    return NextResponse.json({ error: "Already resolved by another request" }, { status: 409 });
  }
  await confirmationHook.resume(`confirmation:${id}`, { approved: true });

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "confirmation.approved",
    toolName: pendingAction.toolName,
    riskLevel: pendingAction.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    status: "completed",
    confirmationStatus: "approved",
    resourceType: "pending_action",
    resourceId: id,
    channel: "web",
  });

  return NextResponse.json({ approved: true });
}
