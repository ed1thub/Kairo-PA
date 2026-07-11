import { NextResponse } from "next/server";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { start } from "workflow/api";
import { getDb } from "@/db/client";
import { automations } from "@/db/schema";
import { verifyCronRequest } from "@/lib/cron-auth";
import { automationRunWorkflow } from "@/workflows/automation-run";

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const due = await db
    .select()
    .from(automations)
    .where(and(eq(automations.enabled, true), isNotNull(automations.nextRunAt), lte(automations.nextRunAt, new Date())));

  for (const automation of due) {
    await start(automationRunWorkflow, [automation.id]);
  }

  return NextResponse.json({ triggered: due.length });
}
