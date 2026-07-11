import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { start } from "workflow/api";
import { getDb } from "@/db/client";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ingestDocumentWorkflow } from "@/workflows/ingest-document";
import { SUPPORTED_DOCUMENT_MIME_TYPES } from "@/lib/file-parsers";

export async function POST(request: Request) {
  const { user, workspace } = await getCurrentUser();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return new NextResponse("file is required", { status: 400 });
  }
  if (!SUPPORTED_DOCUMENT_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
  }

  const blob = await put(`documents/${user.id}/${crypto.randomUUID()}-${file.name}`, file, {
    access: "private",
    contentType: file.type,
  });

  const db = getDb();
  const [document] = await db
    .insert(documents)
    .values({
      userId: user.id,
      workspaceId: workspace.id,
      filename: file.name,
      mimeType: file.type,
      sourceChannel: "web",
      blobUrl: blob.url,
      sizeBytes: file.size,
    })
    .returning();

  await start(ingestDocumentWorkflow, [document.id]);

  return NextResponse.json({ documentId: document.id, status: document.status });
}
