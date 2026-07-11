import { parsePdf } from "./pdf";
import { parseDocx } from "./docx";
import { parseXlsx } from "./xlsx";
import { parsePptx } from "./pptx";
import { parseText } from "./text";

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/x-markdown",
]);

// Shared with the web upload route and the Telegram file-forward handler so
// both entry points accept exactly the same set of formats.
export const SUPPORTED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ...TEXT_MIME_TYPES,
]);

export class UnsupportedFileTypeError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported file type: ${mimeType}`);
    this.name = "UnsupportedFileTypeError";
  }
}

export async function parseDocument(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") return parsePdf(buffer);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return parseDocx(buffer);
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return parseXlsx(buffer);
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return parsePptx(buffer);
  }
  if (TEXT_MIME_TYPES.has(mimeType)) return parseText(buffer);
  throw new UnsupportedFileTypeError(mimeType);
}
