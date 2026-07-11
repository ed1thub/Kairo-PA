import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { RRule } from "rrule";
import { getDb } from "@/db/client";
import { automations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const createAutomationSchema = z.object({
  name: z.string().min(1),
  schedule: z.string().min(1).describe("RFC5545 RRULE string"),
  actions: z.array(z.object({ toolName: z.string(), input: z.unknown() })).min(1),
});

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(automations)
    .where(eq(automations.userId, user.id))
    .orderBy(desc(automations.createdAt));
  return NextResponse.json({ automations: rows });
}

export async function POST(request: Request) {
  const { user, workspace } = await getCurrentUser();
  const input = createAutomationSchema.parse(await request.json());

  let nextRunAt: Date | null = null;
  try {
    nextRunAt = RRule.fromString(input.schedule).after(new Date(), true);
  } catch {
    return NextResponse.json({ error: "Invalid RRULE schedule" }, { status: 400 });
  }

  const db = getDb();
  const [automation] = await db
    .insert(automations)
    .values({
      userId: user.id,
      name: input.name,
      trigger: "schedule",
      schedule: input.schedule,
      actions: input.actions,
      nextRunAt,
    })
    .returning();

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "automation.create",
    status: "completed",
    resourceType: "automation",
    resourceId: automation.id,
    channel: "web",
  });

  return NextResponse.json({ automation });
}
