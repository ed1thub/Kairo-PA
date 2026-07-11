import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.userId, user.id))
    .orderBy(desc(documents.uploadedAt));
  return NextResponse.json({ documents: rows });
}
