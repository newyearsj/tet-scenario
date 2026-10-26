import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { buildTestDesignWorkbook, ExportValidationError, loadTestDesignExport, REVIEW_STATUSES, summarizeExport } from "@/lib/exports/test-design-export";

export const runtime = "nodejs";
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") || "";
  if (!isUuid(projectId)) return NextResponse.json({ error: "프로젝트 식별자가 올바르지 않습니다." }, { status: 400 });
  try { const data = await loadTestDesignExport(projectId, { reviewStatuses: [...REVIEW_STATUSES], includeSamples: false, approvedOnly: false }); return NextResponse.json({ summary: summarizeExport(data) }); }
  catch (error) { return exportError(error, "내보내기 대상을 불러오지 못했습니다."); }
}

export async function POST(request: NextRequest) {
  let projectId = "";
  try {
    const body = await request.json(); projectId = String(body.projectId || "");
    if (!isUuid(projectId)) return NextResponse.json({ error: "프로젝트 식별자가 올바르지 않습니다." }, { status: 400 });
    const reviewStatuses = Array.isArray(body.reviewStatuses) ? body.reviewStatuses.filter((s: unknown) => REVIEW_STATUSES.includes(s as never)) : [];
    const approvedOnly = body.mode === "approved";
    if (!approvedOnly && !reviewStatuses.length) return NextResponse.json({ error: "포함할 검토 상태를 하나 이상 선택해 주세요." }, { status: 400 });
    const data = await loadTestDesignExport(projectId, { reviewStatuses, includeSamples: body.includeSamples === true, approvedOnly });
    const result = await buildTestDesignWorkbook(data);
    const sql = getDatabase();
    await sql`INSERT INTO change_logs (id,project_id,target_type,action,after_data) VALUES (${randomUUID()},${projectId},'export','test_design_exported',${sql.json({ fileName: result.fileName, includedTestCaseCount: result.summary.includedTestCaseCount, approvedOnly })})`;
    return new NextResponse(result.buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (isUuid(projectId)) { try { const sql = getDatabase(); await sql`INSERT INTO change_logs (id,project_id,target_type,action,after_data) VALUES (${randomUUID()},${projectId},'export','test_design_export_failed',${sql.json({ reason: error instanceof ExportValidationError ? "validation" : "generation" })})`; } catch { /* 원래 오류를 유지한다. */ } }
    return exportError(error, "테스트 설계 Excel 생성에 실패했습니다.");
  }
}

function exportError(error: unknown, fallback: string) {
  if (error instanceof ExportValidationError) return NextResponse.json({ error: "산출물 검증에 실패했습니다.", issues: error.issues.slice(0, 20) }, { status: 422 });
  if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ error: "데이터베이스 연결이 설정되지 않았습니다." }, { status: 503 });
  const safeCode = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED]") : "UNKNOWN";
  console.error(`내보내기 실패: ${safeCode}`);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
