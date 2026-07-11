import { OfficeParser } from "officeparser";

export async function parsePptx(buffer: Buffer): Promise<string> {
  const ast = await OfficeParser.parseOffice(buffer);
  return ast.toText();
}
