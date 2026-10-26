import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { cleanList, cleanSteps, cleanText, perspectives, redactForLog, reviewStatuses, testLevels, validateSteps } from "@/lib/test-case-validation";

export const runtime = "nodejs";
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "테스트 케이스 식별자가 올바르지 않습니다." }, { status: 400 });
  try {
    const sql = getDatabase();
    const [testCase] = await sql`SELECT tc.*,ts.code scenario_code,ts.title scenario_title FROM test_cases tc LEFT JOIN test_scenarios ts ON ts.id=tc.scenario_id WHERE tc.id=${id}`;
    if (!testCase) return NextResponse.json({ error: "테스트 케이스를 찾을 수 없습니다." }, { status: 404 });
    const versions = await sql`SELECT id,version,snapshot,modification_reason,modified_source,actor_label,replaced_at FROM test_case_versions WHERE test_case_id=${id} ORDER BY version DESC`;
    return NextResponse.json({ testCase, versions });
  } catch { return NextResponse.json({ error: "테스트 케이스 상세를 불러오지 못했습니다." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "테스트 케이스 식별자가 올바르지 않습니다." }, { status: 400 });
  try {
    const body = await request.json();
    const title = cleanText(body.title, 500), objective = cleanText(body.objective, 2000), priority = cleanText(body.priority, 50), priorityReason = cleanText(body.priorityReason, 1000), userRole = cleanText(body.userRole, 300);
    const testLevel = cleanText(body.testLevel), perspective = cleanText(body.perspective), reviewStatus = cleanText(body.reviewStatus), reason = cleanText(body.modificationReason, 1000);
    const requirements = cleanList(body.relatedRequirementCodes), screens = cleanList(body.relatedScreenIds), questions = cleanList(body.questionCodes), preconditions = cleanList(body.preconditions), testData = cleanList(body.testData), steps = cleanSteps(body.steps);
    if (!title || !objective || !priority || !priorityReason || !reason || !testLevels.includes(testLevel as never) || !perspectives.includes(perspective as never) || !reviewStatuses.includes(reviewStatus as never) || !preconditions.length || !testData.length || !validateSteps(steps)) return NextResponse.json({ error: "필수 필드, 수정 사유와 단계별 기대 결과를 확인해 주세요." }, { status: 400 });
    const sql = getDatabase();
    const updated = await sql.begin(async (tx) => {
      const [current] = await tx`SELECT * FROM test_cases WHERE id=${id} FOR UPDATE`;
      if (!current) throw new Error("NOT_FOUND");
      const [refCounts] = await tx`SELECT (SELECT count(*)::int FROM requirements WHERE project_id=${current.project_id} AND code=ANY(${requirements}) AND status <> 'deleted') requirements, (SELECT count(*)::int FROM review_questions WHERE project_id=${current.project_id} AND code=ANY(${questions}) ) questions`;
      if (Number(refCounts.requirements) !== new Set(requirements).size || Number(refCounts.questions) !== new Set(questions).size) throw new Error("REFERENCE_INVALID");
      const openQuestions = questions.length ? await tx`SELECT code FROM review_questions WHERE project_id=${current.project_id} AND code=ANY(${questions}) AND status IN ('open','answered')` : [];
      if (reviewStatus === "approved" && openQuestions.length) throw new Error("OPEN_QUESTION");
      const safeCurrent = JSON.parse(JSON.stringify(redactForLog(current)));
      await tx`INSERT INTO test_case_versions (id,project_id,test_case_id,code,version,snapshot,modification_reason,modified_source,actor_label) VALUES (${randomUUID()},${current.project_id},${id},${current.code},${current.version},${tx.json(safeCurrent)},${reason},'user_edit','현재 로컬 프로젝트 사용자')`;
      const safeSteps = steps.map((step) => ({ number: step.number, action: step.action, expectedResult: step.expectedResult }));
      const [row] = await tx`UPDATE test_cases SET title=${title},objective=${objective},test_level=${testLevel},perspective=${perspective},priority=${priority},priority_reason=${priorityReason},user_role=${userRole || null},related_requirement_codes=${requirements},related_screen_ids=${screens},preconditions=${tx.json(preconditions)},test_data=${tx.json(testData)},steps=${tx.json(safeSteps)},question_codes=${questions},review_status=${reviewStatus},version=version+1,last_modified_source='user_edit',modification_reason=${reason},updated_at=now() WHERE id=${id} RETURNING *`;
      const safeRow = JSON.parse(JSON.stringify(redactForLog(row)));
      await tx`INSERT INTO change_logs (id,project_id,target_type,target_id,target_code,target_version,action,change_source,actor_label,reason,before_data,after_data) VALUES (${randomUUID()},${current.project_id},'test_case',${id},${current.code},${row.version},'test_case_updated','user_edit','현재 로컬 프로젝트 사용자',${reason},${tx.json(safeCurrent)},${tx.json(safeRow)})`;
      return row;
    });
    return NextResponse.json({ testCase: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "테스트 케이스를 찾을 수 없습니다." }, { status: 404 });
    if (error instanceof Error && error.message === "REFERENCE_INVALID") return NextResponse.json({ error: "현재 프로젝트에 없거나 삭제된 참조 코드가 포함되어 있습니다." }, { status: 422 });
    if (error instanceof Error && error.message === "OPEN_QUESTION") return NextResponse.json({ error: "미결 확인 질문에 의존하는 케이스는 승인할 수 없습니다." }, { status: 422 });
    return NextResponse.json({ error: "테스트 케이스를 저장하지 못했습니다." }, { status: 500 });
  }
}
