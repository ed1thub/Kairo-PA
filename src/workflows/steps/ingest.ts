import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { FatalError } from "workflow";
import { getDb } from "@/db/client";
import { documents, documentChunks } from "@/db/schema";
import { parseDocument } from "@/lib/file-parsers";
import { chunkText } from "@/lib/chunking";
import { embedDocumentChunks } from "@/lib/embeddings";

async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function parseAndChunkDocument(
  documentId: string,
): Promise<{ userId: string; chunks: string[] }> {
  "use step";
  const db = getDb();
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!document) throw new FatalError(`Document ${documentId} not found`);

  await db.update(documents).set({ status: "parsing" }).where(eq(documents.id, documentId));

  try {
    const blob = await get(document.blobUrl, { access: "private" });
    if (!blob?.stream) throw new Error("Blob not found");
    const buffer = await streamToBuffer(blob.stream);
    const text = await parseDocument(buffer, document.mimeType);
    const chunks = chunkText(text);

    await db.update(documents).set({ status: "parsed" }).where(eq(documents.id, documentId));
    return { userId: document.userId, chunks };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(documents).set({ status: "failed", error: message }).where(eq(documents.id, documentId));
    // Unsupported/corrupt files won't parse any differently on retry, so this
    // is always fatal rather than left to the step's default auto-retry.
    throw new FatalError(message);
  }
}

export async function embedAndStoreChunks(documentId: string, userId: string, chunks: string[]) {
  "use step";
  const db = getDb();

  if (chunks.length === 0) {
    await db
      .update(documents)
      .set({ status: "ready", processedAt: new Date() })
      .where(eq(documents.id, documentId));
    return;
  }

  await db.update(documents).set({ status: "embedding" }).where(eq(documents.id, documentId));

  const embeddings = await embedDocumentChunks(chunks);

  await db.insert(documentChunks).values(
    chunks.map((content, i) => ({
      documentId,
      userId,
      chunkIndex: i,
      content,
      tokenCount: Math.ceil(content.length / 4),
      embedding: embeddings[i],
    })),
  );

  await db
    .update(documents)
    .set({ status: "ready", processedAt: new Date() })
    .where(eq(documents.id, documentId));
}
