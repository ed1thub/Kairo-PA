import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const { user } = await getCurrentUser();
  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);

  const db = getDb();
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, user.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  return NextResponse.json({ auditLogs: rows, page, pageSize: PAGE_SIZE });
}
