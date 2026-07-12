import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const { user } = await getCurrentUser();
  const db = getDb();
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      pinned: conversations.pinned,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(and(eq(conversations.userId, user.id), eq(conversations.channel, "web")))
    .orderBy(desc(conversations.pinned), desc(conversations.updatedAt));
  return NextResponse.json({ conversations: rows });
}
