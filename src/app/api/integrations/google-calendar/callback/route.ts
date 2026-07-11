import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getOAuthClient } from "@/lib/google-calendar";
import { getRedis } from "@/lib/redis";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  const { user, workspace } = await getCurrentUser();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const base = process.env.APP_BASE_URL ?? new URL(request.url).origin;

  if (!code || !state) {
    return NextResponse.redirect(`${base}/integrations?error=missing_code_or_state`);
  }

  const redis = getRedis();
  const stateKey = `oauth-state:google-calendar:${state}`;
  const expectedUserId = await redis.get<string>(stateKey);
  await redis.del(stateKey);

  if (!expectedUserId || expectedUserId !== user.id) {
    return NextResponse.redirect(`${base}/integrations?error=invalid_state`);
  }

  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    return NextResponse.redirect(`${base}/integrations?error=no_access_token`);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, user.id), eq(integrations.provider, "google_calendar")))
    .limit(1);

  const values = {
    accessToken: encrypt(tokens.access_token),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refreshToken,
    scope: tokens.scope,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    status: "connected" as const,
    connectedAt: new Date(),
    revokedAt: null,
  };

  if (existing) {
    await db.update(integrations).set(values).where(eq(integrations.id, existing.id));
  } else {
    await db.insert(integrations).values({ userId: user.id, provider: "google_calendar", ...values });
  }

  await writeAuditLog({
    userId: user.id,
    workspaceId: workspace.id,
    action: "integration.google_calendar.connected",
    status: "completed",
    resourceType: "integration",
    channel: "web",
  });

  return NextResponse.redirect(`${base}/integrations?connected=google_calendar`);
}
