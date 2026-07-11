import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { getOAuthClient } from "@/lib/google-calendar";
import { decrypt } from "@/lib/encryption";
import { writeAuditLog } from "@/lib/audit";

export async function POST() {
  const { user, workspace } = await getCurrentUser();
  const db = getDb();
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, user.id), eq(integrations.provider, "google_calendar")))
    .limit(1);

  if (!integration) return new NextResponse("Not connected", { status: 404 });

  await getOAuthClient()
    .revokeToken(decrypt(integration.accessToken))
    .catch(() => {
      // Token may already be invalid/expired at Google's end — still
      // proceed to mark it revoked locally so the user isn't stuck.
    });

  await db
    .update(integrations)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(integrations.id, integration.id));

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "integration.google_calendar.revoked",
    status: "completed",
    resourceType: "integration",
    channel: "web",
  });

  return NextResponse.json({ revoked: true });
}
