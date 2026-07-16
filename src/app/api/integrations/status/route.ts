import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { integrations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const [calendarIntegration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, user.id), eq(integrations.provider, "google_calendar")))
    .limit(1);

  return NextResponse.json({ calendarConnected: calendarIntegration?.status === "connected" });
}
