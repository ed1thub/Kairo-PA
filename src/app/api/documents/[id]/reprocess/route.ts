import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { start } from "workflow/api";
import { getDb } from "@/db/client";
import { documents, documentChunks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ingestDocumentWorkflow } from "@/workflows/ingest-document";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser();
  const { id } = await params;
  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
    .limit(1);

  if (!document) return new NextResponse("Not found", { status: 404 });

  // Full re-run from scratch, not a partial resume — parsing is cheap and
  // this keeps the ingestion workflow simple (see plan section 7).
  await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
  await db
    .update(documents)
    .set({ status: "uploaded", error: null, processedAt: null })
    .where(eq(documents.id, id));

  await start(ingestDocumentWorkflow, [id]);

  return NextResponse.json({ reprocessing: true });
}
