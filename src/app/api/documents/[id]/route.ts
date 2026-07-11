import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { del } from "@vercel/blob";
import { getDb } from "@/db/client";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser();
  const { id } = await params;
  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
    .limit(1);

  if (!document) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({ document });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser();
  const { id } = await params;
  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
    .limit(1);

  if (!document) return new NextResponse("Not found", { status: 404 });

  await del(document.blobUrl).catch(() => {
    // Blob may already be gone — deleting the DB row (and its cascaded
    // chunks) is what matters for correctness here.
  });
  await db.delete(documents).where(eq(documents.id, id));

  return NextResponse.json({ deleted: true });
}
