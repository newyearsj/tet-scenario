import "server-only";
import * as XLSX from "xlsx";

export const ANALYSIS_CHARACTER_LIMIT = 80_000;
export const SUPPORTED_EXTENSIONS = new Set(["txt", "md", "csv", "xlsx", "xls"]);

export interface ParsedDocument {
  originalText: string;
  analysisText: string;
  originalCharacterCount: number;
  analyzedCharacterCount: number;
  unanalyzedCharacterCount: number;
  parseStatus: "parsed" | "over_limit" | "empty";
  sourceMap: Array<{ sheet?: string; cell?: string; line?: number }>;
}

function truncateForAnalysis(originalText: string, sourceMap: ParsedDocument["sourceMap"]): ParsedDocument {
  const originalCharacterCount = originalText.length;
  const analysisText = originalText.slice(0, ANALYSIS_CHARACTER_LIMIT);
  const analyzedCharacterCount = analysisText.length;
  const unanalyzedCharacterCount = Math.max(0, originalCharacterCount - analyzedCharacterCount);
  return { originalText, analysisText, originalCharacterCount, analyzedCharacterCount, unanalyzedCharacterCount, parseStatus: originalCharacterCount === 0 ? "empty" : unanalyzedCharacterCount > 0 ? "over_limit" : "parsed", sourceMap };
}

export async function parseDocument(file: File): Promise<ParsedDocument> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error("UNSUPPORTED_FILE_TYPE");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (extension === "txt" || extension === "md" || extension === "csv") {
    const originalText = new TextDecoder("utf-8", { fatal: false }).decode(buffer).replace(/^\uFEFF/, "");
    const sourceMap = originalText.split(/\r?\n/).map((_, index) => ({ line: index + 1 }));
    return truncateForAnalysis(originalText, sourceMap);
  }
  const workbook = XLSX.read(buffer, { type: "buffer", cellText: true, cellDates: true });
  const lines: string[] = [];
  const sourceMap: ParsedDocument["sourceMap"] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: column });
        const cell = sheet[cellAddress];
        if (!cell || cell.v === undefined || cell.v === null || String(cell.v).trim() === "") continue;
        lines.push(`[${sheetName}!${cellAddress}] ${String(cell.w ?? cell.v)}`);
        sourceMap.push({ sheet: sheetName, cell: cellAddress });
      }
    }
  }
  return truncateForAnalysis(lines.join("\n"), sourceMap);
}
