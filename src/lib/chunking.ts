// Character-based approximation of token-sized chunks (~4 chars/token is a
// reasonable rule of thumb for English text). Good enough for V1 retrieval
// chunk boundaries — see docs/ASSUMPTIONS.md for why this isn't a real
// tokenizer.
const CHARS_PER_TOKEN_ESTIMATE = 4;
const CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunkSize = CHUNK_TOKENS * CHARS_PER_TOKEN_ESTIMATE;
  const overlap = OVERLAP_TOKENS * CHARS_PER_TOKEN_ESTIMATE;

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === normalized.length) break;
    start = end - overlap;
  }
  return chunks;
}
