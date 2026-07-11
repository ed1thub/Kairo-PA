import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { toolPermissions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const rows = await db.select().from(toolPermissions).where(eq(toolPermissions.userId, user.id));
  return NextResponse.json({ permissions: rows });
}
