import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pendingActions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(pendingActions)
    .where(and(eq(pendingActions.userId, user.id), eq(pendingActions.status, "pending")));
  return NextResponse.json({ pendingActions: rows });
}
