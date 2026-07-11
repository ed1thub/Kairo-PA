import { NextResponse } from "next/server";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { telegramLinks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  const { user, workspace } = await getCurrentUser();
  const { code } = (await request.json()) as { code?: string };

  if (!code?.trim()) {
    return new NextResponse("code is required", { status: 400 });
  }

  const db = getDb();
  const normalizedCode = code.trim().toUpperCase();

  const [link] = await db
    .select()
    .from(telegramLinks)
    .where(
      and(
        eq(telegramLinks.linkCode, normalizedCode),
        eq(telegramLinks.status, "pending"),
        gt(telegramLinks.linkCodeExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!link) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 404 });
  }

  await db
    .update(telegramLinks)
    .set({ userId: user.id, status: "linked", linkedAt: new Date(), linkCode: null })
    .where(eq(telegramLinks.id, link.id));

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "integration.telegram.linked",
    status: "completed",
    resourceType: "telegram_link",
    resourceId: link.id,
    channel: "web",
  });

  return NextResponse.json({ linked: true });
}
