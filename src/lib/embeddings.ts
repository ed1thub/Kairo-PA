import { embed, embedMany } from "ai";
import { google } from "@ai-sdk/google";

// gemini-embedding-001 natively outputs 3072 dimensions but supports MRL
// truncation via outputDimensionality. Pinned to 768 to match the
// document_chunks.embedding column — see docs/ASSUMPTIONS.md if this ever
// needs to change (requires a migration + re-embedding all chunks).
export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

function embeddingModel() {
  return google.embedding(EMBEDDING_MODEL_ID);
}

export async function embedDocumentChunks(chunks: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel(),
    values: chunks,
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" },
    },
  });
  return embeddings;
}

export async function embedSearchQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel(),
    value: query,
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_QUERY" },
    },
  });
  return embedding;
}
