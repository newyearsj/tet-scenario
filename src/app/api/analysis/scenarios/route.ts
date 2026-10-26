import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateTestScenarios } from "@/lib/ai/scenario-generation";
import { AiConfigurationError, getOpenAIModel } from "@/lib/ai/openai-client";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = String(body.projectId ?? "");
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds.filter((id: unknown): id is string => typeof id === "string" && isUuid(id)) : [];
    if (!isUuid(projectId) || !documentIds.length) return NextResponse.json({ error: "시나리오를 만들 프로젝트와 저장된 문서가 필요합니다." }, { status: 400 });

    const sql = getDatabase();
    const documents = await sql`SELECT id, file_name, analysis_text FROM documents WHERE project_id = ${projectId} AND id = ANY(${documentIds}) AND parse_status IN ('parsed', 'over_limit') ORDER BY uploaded_at`;
    if (documents.length !== documentIds.length) return NextResponse.json({ error: "빈 문서 또는 읽을 수 없는 문서가 포함되어 시나리오 생성을 시작하지 않았습니다." }, { status: 400 });

    const generated = await generateTestScenarios({
      documents: documents.map((item) => ({ id: item.id, fileName: item.file_name, analysisText: item.analysis_text })),
      signal: request.signal,
    });
    const batchId = randomUUID();
    const externalCode = `AI-TS-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const scenarios = generated.scenarios.map((scenario) => ({ ...scenario, id: randomUUID(), isSample: false }));

    await sql.begin(async (transaction) => {
      await transaction`INSERT INTO scenario_batches (id, project_id, external_code, source_document_ids, model_name, is_sample) VALUES (${batchId}, ${projectId}, ${externalCode}, ${documentIds}, ${getOpenAIModel()}, false)`;
      for (const scenario of scenarios) {
        await transaction`INSERT INTO test_scenarios (id, project_id, batch_id, code, title, user_role, user_goal, related_requirement_codes, related_screen_ids, start_condition, main_flow, branches, end_condition, priority, rationale, evidence, review_status, is_sample) VALUES (${scenario.id}, ${projectId}, ${batchId}, ${scenario.code}, ${scenario.title}, ${scenario.userRole}, ${scenario.userGoal}, ${scenario.relatedRequirementCodes}, ${scenario.relatedScreenIds}, ${scenario.startCondition}, ${transaction.json(scenario.mainFlow)}, ${transaction.json(scenario.branches)}, ${scenario.endCondition}, ${scenario.priority}, ${scenario.rationale}, ${transaction.json(scenario.evidence)}, ${scenario.reviewStatus}, false)`;
        if (scenario.reviewStatus === "needs_review") await transaction`INSERT INTO review_questions (id, project_id, code, question_type, question, related_requirement_codes, related_screen_ids, evidence) VALUES (${randomUUID()}, ${projectId}, ${`Q-${scenario.code}`}, 'condition_missing', ${`${scenario.title} 시나리오의 확인 필요 조건을 결정해 주세요.`}, ${scenario.relatedRequirementCodes}, ${scenario.relatedScreenIds}, ${transaction.json(scenario.evidence)}) ON CONFLICT (project_id, code) DO NOTHING`;
      }
      await transaction`INSERT INTO change_logs (id, project_id, target_type, target_id, action, after_data) VALUES (${randomUUID()}, ${projectId}, 'scenario_batch', ${batchId}, 'scenarios_generated', ${transaction.json({ externalCode, count: scenarios.length })})`;
    });
    return NextResponse.json({ batchId, externalCode, isSample: false, scenarios });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) return NextResponse.json({ error: "시나리오 생성 요청이 취소되었습니다. 결과는 저장되지 않았습니다." }, { status: 499 });
    if (error instanceof AiConfigurationError) return NextResponse.json({ error: `${error.missing}가 설정되지 않았습니다. 서버의 .env.local 설정을 확인해 주세요.`, code: "AI_NOT_CONFIGURED" }, { status: 503 });
    if (error instanceof ZodError || (error instanceof Error && error.message.startsWith("AI_"))) return NextResponse.json({ error: "AI 응답이 시나리오 구조 또는 근거 검증을 통과하지 못했습니다. 결과는 저장되지 않았습니다.", code: "AI_VALIDATION_FAILED" }, { status: 422 });
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
    console.error("OpenAI 시나리오 생성 실패", { type: error instanceof Error ? error.constructor.name : "UnknownError", status });
    return NextResponse.json({ error: "OpenAI 시나리오 생성 요청에 실패했습니다. 잠시 후 다시 시도해 주세요. 결과는 저장되지 않았습니다.", code: "AI_REQUEST_FAILED" }, { status: 502 });
  }
}
