import { parseAndChunkDocument, embedAndStoreChunks } from "./steps/ingest";

export async function ingestDocumentWorkflow(documentId: string) {
  "use workflow";
  const { userId, chunks } = await parseAndChunkDocument(documentId);
  await embedAndStoreChunks(documentId, userId, chunks);
}
