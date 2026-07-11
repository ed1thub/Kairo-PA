export async function parseText(buffer: Buffer): Promise<string> {
  return buffer.toString("utf-8");
}
