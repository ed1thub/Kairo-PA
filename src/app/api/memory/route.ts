import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(memories)
    .where(eq(memories.userId, user.id))
    .orderBy(desc(memories.createdAt));
  return NextResponse.json({ memories: rows });
}
