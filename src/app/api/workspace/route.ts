import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
  if (!isUuid(projectId)) return NextResponse.json({ error: "프로젝트 식별자가 올바르지 않습니다." }, { status: 400 });
  try {
    const sql = getDatabase();
    const [counts] = await sql`
      SELECT
        (SELECT count(*)::int FROM documents WHERE project_id = ${projectId}) document_count,
        (SELECT count(*)::int FROM requirements WHERE project_id = ${projectId} AND status <> 'deleted') requirement_count,
        (SELECT count(*)::int FROM review_questions WHERE project_id = ${projectId} AND status IN ('open','answered')) question_count,
        (SELECT count(*)::int FROM test_scenarios WHERE project_id = ${projectId}) scenario_count,
        (SELECT count(*)::int FROM test_cases WHERE project_id = ${projectId}) test_case_count,
        (SELECT count(*)::int FROM test_cases WHERE project_id = ${projectId} AND review_status='draft') draft_test_case_count,
        (SELECT count(*)::int FROM test_cases WHERE project_id = ${projectId} AND review_status IN ('needs_review','re_review')) needs_review_test_case_count,
        (SELECT count(*)::int FROM test_cases WHERE project_id = ${projectId} AND review_status IN ('reviewed','approved')) reviewed_test_case_count,
        (SELECT count(*)::int FROM test_cases WHERE project_id = ${projectId} AND last_modified_source='user_edit') user_edited_test_case_count,
        (SELECT count(DISTINCT r.id)::int FROM requirements r LEFT JOIN test_cases tc ON tc.project_id=r.project_id AND r.code=ANY(tc.related_requirement_codes) AND tc.review_status IN ('reviewed','approved') WHERE r.project_id=${projectId} AND r.status <> 'deleted' AND tc.id IS NULL) uncovered_count
    `;
    const questions = await sql`SELECT * FROM review_questions WHERE project_id=${projectId} ORDER BY created_at DESC`;
    const scenarios = await sql`SELECT id, code, title, review_status FROM test_scenarios WHERE project_id=${projectId} ORDER BY created_at DESC`;
    const testCases = await sql`SELECT tc.*, ts.code scenario_code FROM test_cases tc LEFT JOIN test_scenarios ts ON ts.id=tc.scenario_id WHERE tc.project_id=${projectId} ORDER BY tc.created_at DESC`;
    const requirements = await sql`SELECT r.*, COALESCE(array_agg(DISTINCT ts.code) FILTER (WHERE ts.code IS NOT NULL), '{}') scenario_codes, COALESCE(array_agg(DISTINCT tc.code) FILTER (WHERE tc.code IS NOT NULL), '{}') test_case_codes, bool_or(tc.review_status IN ('reviewed','approved')) covered FROM requirements r LEFT JOIN test_scenarios ts ON ts.project_id=r.project_id AND r.code=ANY(ts.related_requirement_codes) LEFT JOIN test_cases tc ON tc.project_id=r.project_id AND r.code=ANY(tc.related_requirement_codes) WHERE r.project_id=${projectId} GROUP BY r.id ORDER BY r.code`;
    const activities = await sql`SELECT id,target_type,target_id,target_code,target_version,action,change_source,actor_label,reason,before_data,after_data,created_at FROM change_logs WHERE project_id=${projectId} ORDER BY created_at DESC LIMIT 200`;
    return NextResponse.json({ counts, questions, scenarios, testCases, requirements, activities });
  } catch {
    return NextResponse.json({ error: "프로젝트 작업 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!isUuid(id) || !["open", "answered", "decided", "deferred"].includes(status)) return NextResponse.json({ error: "질문 상태 요청이 올바르지 않습니다." }, { status: 400 });
    const sql = getDatabase();
    const [row] = await sql.begin(async (tx) => {
      const updated = await tx`UPDATE review_questions SET status=${status}, answer=${body.answer || null}, decision_reason=${body.decisionReason || null}, decided_at=${status === "decided" ? new Date() : null} WHERE id=${id} RETURNING *`;
      if (updated[0]) await tx`INSERT INTO change_logs (id, project_id, target_type, target_id, action, after_data) VALUES (${randomUUID()}, ${updated[0].project_id}, 'question', ${id}, ${`question_${status}`}, ${tx.json(updated[0])})`;
      return updated;
    });
    return NextResponse.json({ question: row });
  } catch { return NextResponse.json({ error: "확인 필요 사항을 저장하지 못했습니다." }, { status: 500 }); }
}
