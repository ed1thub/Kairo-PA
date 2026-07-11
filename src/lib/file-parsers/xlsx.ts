import * as XLSX from "xlsx";

export async function parseXlsx(buffer: Buffer): Promise<string> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    return `# ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
  }).join("\n\n");
}
