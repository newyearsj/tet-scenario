import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateTestCases } from "@/lib/ai/test-case-generation";
import { AiConfigurationError, getOpenAIModel } from "@/lib/ai/openai-client";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json(); const projectId = String(body.projectId ?? ""); const requestKey = String(body.requestKey ?? "");
    const scenarioIds: string[] = Array.isArray(body.scenarioIds) ? [...new Set<string>(body.scenarioIds.filter((id: unknown): id is string => typeof id === "string" && isUuid(id)))] : [];
    if (!isUuid(projectId) || !scenarioIds.length || !isUuid(requestKey)) return NextResponse.json({ error: "생성 대상과 중복 방지 키가 올바르지 않습니다." }, { status: 400 });
    const sql = getDatabase();
    const scenarios = await sql`SELECT * FROM test_scenarios WHERE project_id=${projectId} AND id=ANY(${scenarioIds}) ORDER BY code`;
    if (scenarios.length !== scenarioIds.length) return NextResponse.json({ error: "현재 프로젝트에 없는 시나리오가 포함되어 있습니다." }, { status: 400 });
    const requirementCodes = [...new Set(scenarios.flatMap((s) => s.related_requirement_codes as string[]))];
    const validRequirements = requirementCodes.length ? await sql`SELECT code FROM requirements WHERE project_id=${projectId} AND code=ANY(${requirementCodes}) AND status <> 'deleted'` : [];
    if (validRequirements.length !== requirementCodes.length) return NextResponse.json({ error: "시나리오가 현재 프로젝트에 없거나 삭제된 요구사항을 참조합니다. 요구사항 데이터를 먼저 정비해 주세요." }, { status: 422 });
    const generationKey = `tc:${requestKey}`; const batchId = randomUUID(); const externalCode = `AI-TC-${Date.now()}-${randomUUID().slice(0, 8)}`;
    try { await sql`INSERT INTO test_case_batches (id,project_id,external_code,scenario_ids,model_name,status,generation_key) VALUES (${batchId},${projectId},${externalCode},${scenarioIds},${getOpenAIModel()},'processing',${generationKey})`; }
    catch { return NextResponse.json({ error: "동일한 생성 요청이 이미 처리되었습니다." }, { status: 409 }); }
    const results: { scenarioId: string; scenarioCode: string; status: "completed" | "failed"; count: number; error?: string }[] = [];
    for (const scenario of scenarios) {
      const resultId = randomUUID(); await sql`INSERT INTO test_case_batch_results (id,project_id,batch_id,scenario_id,status) VALUES (${resultId},${projectId},${batchId},${scenario.id},'processing')`;
      try {
        const input = [{ code: scenario.code, title: scenario.title, userRole: scenario.user_role, userGoal: scenario.user_goal, requirements: scenario.related_requirement_codes, screens: scenario.related_screen_ids, startCondition: scenario.start_condition, mainFlow: scenario.main_flow, branches: scenario.branches, endCondition: scenario.end_condition, evidence: scenario.evidence }];
        const generated = await generateTestCases({ scenarios: input, signal: request.signal });
        await sql.begin(async (tx) => {
          for (const tc of generated.testCases) {
            const [existing] = await tx`SELECT * FROM test_cases WHERE project_id=${projectId} AND scenario_id=${scenario.id} AND objective=${tc.objective} ORDER BY version DESC LIMIT 1 FOR UPDATE`;
            if (existing) {
              await tx`INSERT INTO test_case_versions (id,project_id,test_case_id,code,version,snapshot,modification_reason,modified_source,actor_label) VALUES (${randomUUID()},${projectId},${existing.id},${existing.code},${existing.version},${tx.json(existing)},'사용자 확인 후 AI 재생성','change_regeneration','시스템') ON CONFLICT (test_case_id,version) DO NOTHING`;
              const [updated] = await tx`UPDATE test_cases SET batch_id=${batchId},title=${tc.title},test_level=${tc.testLevel},perspective=${tc.perspective},priority=${tc.priority},priority_reason=${tc.priorityReason},related_requirement_codes=${tc.relatedRequirementCodes},related_screen_ids=${tc.relatedScreenIds},user_role=${scenario.user_role},preconditions=${tx.json(tc.preconditions)},test_data=${tx.json(tc.testData)},steps=${tx.json(tc.steps)},evidence=${tx.json(tc.evidence)},question_codes=${tc.questionCodes},review_status='re_review',version=version+1,last_modified_source='change_regeneration',modification_reason='사용자 확인 후 AI 재생성',updated_at=now() WHERE id=${existing.id} RETURNING *`;
              await tx`INSERT INTO change_logs (id,project_id,target_type,target_id,target_code,target_version,action,change_source,actor_label,reason,before_data,after_data) VALUES (${randomUUID()},${projectId},'test_case',${existing.id},${existing.code},${updated.version},'test_case_regenerated','change_regeneration','시스템','사용자 확인 후 AI 재생성',${tx.json(existing)},${tx.json(updated)})`;
            } else {
              const newId = randomUUID();
              await tx`INSERT INTO test_cases (id,project_id,batch_id,scenario_id,code,title,objective,test_level,perspective,priority,priority_reason,related_requirement_codes,related_screen_ids,user_role,preconditions,test_data,steps,evidence,question_codes,review_status,creation_source,last_modified_source) VALUES (${newId},${projectId},${batchId},${scenario.id},${tc.code},${tc.title},${tc.objective},${tc.testLevel},${tc.perspective},${tc.priority},${tc.priorityReason},${tc.relatedRequirementCodes},${tc.relatedScreenIds},${scenario.user_role},${tx.json(tc.preconditions)},${tx.json(tc.testData)},${tx.json(tc.steps)},${tx.json(tc.evidence)},${tc.questionCodes},${tc.reviewStatus},${scenario.is_sample ? 'fixture_sample' : 'openai_actual'},${scenario.is_sample ? 'fixture_sample' : 'openai_actual'})`;
              await tx`INSERT INTO change_logs (id,project_id,target_type,target_id,target_code,target_version,action,change_source,actor_label,after_data) VALUES (${randomUUID()},${projectId},'test_case',${newId},${tc.code},1,'test_case_created',${scenario.is_sample ? 'fixture_sample' : 'openai_actual'},'시스템',${tx.json({ title: tc.title, objective: tc.objective, reviewStatus: tc.reviewStatus })})`;
            }
          }
          await tx`UPDATE test_case_batch_results SET status='completed',generated_count=${generated.testCases.length},updated_at=now() WHERE id=${resultId}`;
          await tx`INSERT INTO change_logs (id,project_id,target_type,target_id,target_code,action,change_source,actor_label,after_data) VALUES (${randomUUID()},${projectId},'test_scenario',${scenario.id},${scenario.code},'test_cases_generated',${scenario.is_sample ? 'fixture_sample' : 'openai_actual'},'시스템',${tx.json({ batchCode: externalCode, count: generated.testCases.length })})`;
        });
        results.push({ scenarioId: scenario.id, scenarioCode: scenario.code, status: "completed", count: generated.testCases.length });
      } catch (error) {
        const code = error instanceof Error && error.message.startsWith("AI_") ? error.message : "GENERATION_FAILED";
        await sql`UPDATE test_case_batch_results SET status='failed',error_code=${code},updated_at=now() WHERE id=${resultId}`;
        results.push({ scenarioId: scenario.id, scenarioCode: scenario.code, status: "failed", count: 0, error: "생성 또는 검증 실패" });
      }
    }
    const completed = results.filter((item) => item.status === "completed").length, failed = results.length - completed;
    const status = completed && failed ? "partial_failed" : failed ? "failed" : "completed";
    await sql`UPDATE test_case_batches SET status=${status},completed_count=${completed},failed_count=${failed},completed_at=now() WHERE id=${batchId}`;
    await sql`INSERT INTO change_logs (id,project_id,target_type,target_id,target_code,action,change_source,actor_label,after_data) VALUES (${randomUUID()},${projectId},'test_case_batch',${batchId},${externalCode},${status === 'completed' ? 'test_case_batch_completed' : 'test_case_batch_partial_failed'},'openai_actual','시스템',${sql.json({ completed, failed })})`;
    return NextResponse.json({ batchCode: externalCode, completed, failed, count: results.reduce((sum, item) => sum + item.count, 0), results }, { status: completed ? 200 : 422 });
  } catch (error) {
    if (error instanceof AiConfigurationError) return NextResponse.json({ error: `${error.missing} 설정을 확인해 주세요.` }, { status: 503 });
    if (error instanceof ZodError || (error instanceof Error && error.message.startsWith("AI_"))) return NextResponse.json({ error: "AI 결과가 테스트 케이스 검증을 통과하지 못했습니다." }, { status: 422 });
    return NextResponse.json({ error: "테스트 케이스 생성에 실패했습니다." }, { status: 502 });
  }
}
