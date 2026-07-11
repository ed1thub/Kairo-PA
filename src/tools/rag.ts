import type { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { documentChunks, documents } from "@/db/schema";
import { embedSearchQuery } from "@/lib/embeddings";
import type { ragSearchInputSchema } from "./schemas";

export interface RagSearchResult {
  documentId: string;
  filename: string;
  content: string;
  similarity: number;
}

/**
 * Semantic search over a single user's documents. `userId` is baked in by
 * the caller (see src/tools/registry.ts) — never accept it as model input,
 * since that would let the agent search across users.
 */
export async function ragSearch(
  userId: string,
  { query, topK }: z.infer<typeof ragSearchInputSchema>,
): Promise<RagSearchResult[]> {
  "use step";
  const db = getDb();
  const queryEmbedding = await embedSearchQuery(query);
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;
  const similarity = sql<number>`1 - (${documentChunks.embedding} <=> ${embeddingLiteral}::vector)`;

  const results = await db
    .select({
      documentId: documentChunks.documentId,
      filename: documents.filename,
      content: documentChunks.content,
      similarity,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .where(and(eq(documentChunks.userId, userId), eq(documents.status, "ready")))
    .orderBy(desc(similarity))
    .limit(topK);

  return results;
}
