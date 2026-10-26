import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { getDatabase } from "@/lib/db";
import { parseDocument, SUPPORTED_EXTENSIONS } from "@/lib/document-parser";

export const runtime = "nodejs";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
  if (!isUuid(projectId)) return NextResponse.json({ error: "올바른 프로젝트 식별자가 필요합니다." }, { status: 400 });
  try {
    const sql = getDatabase();
    const rows = await sql`
      SELECT id, file_name, file_extension, file_size_bytes, document_version,
             original_character_count, analyzed_character_count, unanalyzed_character_count,
             parse_status, uploaded_at
      FROM documents WHERE project_id = ${projectId} ORDER BY uploaded_at DESC
    `;
    return NextResponse.json({ documents: rows });
  } catch (error) {
    return apiError(error, "문서 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const projectId = String(formData.get("projectId") ?? "");
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    if (!isUuid(projectId)) return NextResponse.json({ error: "올바른 프로젝트 식별자가 필요합니다." }, { status: 400 });
    if (!files.length) return NextResponse.json({ error: "업로드할 문서를 선택해 주세요." }, { status: 400 });
    const unsupported = files.filter((file) => !SUPPORTED_EXTENSIONS.has(file.name.split(".").pop()?.toLowerCase() ?? ""));
    if (unsupported.length) return NextResponse.json({ error: `지원하지 않는 파일이 포함되어 있습니다: ${unsupported.map((file) => file.name).join(", ")}` }, { status: 400 });

    const parsedFiles = await Promise.all(files.map(async (file) => ({ file, parsed: await parseDocument(file) })));
    const sql = getDatabase();
    const saved = await sql.begin(async (transaction) => {
      await transaction`INSERT INTO projects (id, name, is_sample) VALUES (${projectId}, NULL, false) ON CONFLICT (id) DO NOTHING`;
      const rows = [];
      for (const { file, parsed } of parsedFiles) {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        const [row] = await transaction`
          INSERT INTO documents (
            id, project_id, file_name, file_extension, mime_type, file_size_bytes,
            original_text, analysis_text, original_character_count, analyzed_character_count,
            unanalyzed_character_count, parse_status, source_map
          ) VALUES (
            ${randomUUID()}, ${projectId}, ${file.name}, ${extension}, ${file.type || null}, ${file.size},
            ${parsed.originalText}, ${parsed.analysisText}, ${parsed.originalCharacterCount},
            ${parsed.analyzedCharacterCount}, ${parsed.unanalyzedCharacterCount}, ${parsed.parseStatus},
            ${transaction.json(parsed.sourceMap)}
          )
          RETURNING id, file_name, file_size_bytes, original_character_count,
                    analyzed_character_count, unanalyzed_character_count, parse_status, uploaded_at
        `;
        rows.push(row);
      }
      return rows;
    });
    return NextResponse.json({ documents: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNSUPPORTED_FILE_TYPE") return NextResponse.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 400 });
    return apiError(error, "문서를 저장하거나 읽지 못했습니다. 파일 형식과 DB 연결을 확인해 주세요.");
  }
}
