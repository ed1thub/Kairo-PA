import { NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pendingActions } from "@/db/schema";
import { verifyCronRequest } from "@/lib/cron-auth";
import { expirePendingAction } from "@/workflows/steps/confirmation";
import { confirmationHook } from "@/workflows/hooks/confirmation";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const overdue = await db
    .select()
    .from(pendingActions)
    .where(and(eq(pendingActions.status, "pending"), lt(pendingActions.expiresAt, new Date())));

  for (const action of overdue) {
    await expirePendingAction(action.id);
    // Resolve the hook with a rejection so the suspended workflow never
    // hangs indefinitely waiting for a response the user never gave.
    await confirmationHook.resume(`confirmation:${action.id}`, { approved: false }).catch(() => {
      // Workflow run may have already ended for other reasons — fine.
    });
    await writeAuditLog({
      userId: action.userId,
      workspaceId: action.workspaceId,
      action: "confirmation.expired",
      toolName: action.toolName,
      riskLevel: action.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      status: "cancelled",
      confirmationStatus: "expired",
      resourceType: "pending_action",
      resourceId: action.id,
      channel: "cron",
    });
  }

  return NextResponse.json({ expired: overdue.length });
}
