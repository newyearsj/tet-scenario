import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { analyzeRequirementChanges } from "@/lib/ai/change-analysis";
import { AiConfigurationError } from "@/lib/ai/openai-client";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const emptyImpact = { requirementsUpdated: 0, scenariosUpdated: 0, scenariosReview: 0, testCasesUpdated: 0, testCasesReview: 0 };
const scopes = [
  { id: "requirements", title: "요구사항까지", description: "선택한 요구사항을 갱신하고, 연결된 기존 시나리오와 테스트 케이스는 재검토 대상으로 표시한다.", available: true },
  { id: "scenarios", title: "시나리오까지", description: "선택한 요구사항과 영향 시나리오를 갱신하고, 연결된 기존 테스트 케이스는 재검토 대상으로 표시한다.", available: true },
  { id: "testCases", title: "테스트 케이스까지", description: "선택한 요구사항과 영향 시나리오·테스트 케이스를 갱신한다.", available: true },
] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = String(body.projectId ?? "");
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds.filter((id: unknown): id is string => typeof id === "string" && isUuid(id)) : [];
    if (!isUuid(projectId) || !documentIds.length) return NextResponse.json({ error: "분석할 프로젝트와 저장된 문서가 필요합니다." }, { status: 400 });

    const sql = getDatabase();
    const documents = await sql`
      SELECT id, file_name, analysis_text FROM documents
      WHERE project_id = ${projectId} AND id = ANY(${documentIds}) AND parse_status IN ('parsed', 'over_limit')
      ORDER BY uploaded_at
    `;
    if (documents.length !== documentIds.length) return NextResponse.json({ error: "빈 문서 또는 읽을 수 없는 문서가 포함되어 있어 분석을 시작하지 않았습니다." }, { status: 400 });
    const existingRequirements = await sql`
      SELECT code, title, description, status FROM requirements
      WHERE project_id = ${projectId} AND is_sample = false AND status <> 'deleted'
      ORDER BY code
    `;

    const analysis = await analyzeRequirementChanges({
      documents: documents.map((document) => ({ id: document.id, fileName: document.file_name, analysisText: document.analysis_text })),
      existingRequirements: existingRequirements.map((requirement) => ({ code: requirement.code, title: requirement.title, description: requirement.description, status: requirement.status })),
      signal: request.signal,
    });

    const changeSetId = randomUUID();
    const externalCode = `AI-CHG-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const impactByProposal: Record<string, Record<string, typeof emptyImpact>> = {};
    const proposals = analysis.proposals.map((proposal, index) => {
      const id = `AI-PROP-${String(index + 1).padStart(3, "0")}`;
      impactByProposal[id] = { requirements: { ...emptyImpact, requirementsUpdated: 1 }, scenarios: { ...emptyImpact, requirementsUpdated: 1 }, testCases: { ...emptyImpact, requirementsUpdated: 1 } };
      return {
        id,
        type: proposal.type,
        requirementCode: proposal.requirementCode,
        title: proposal.title,
        before: proposal.before,
        after: proposal.after,
        reason: proposal.reason,
        relatedRequirementCodes: proposal.relatedRequirementCodes,
        source: {
          documentName: proposal.source.documentName,
          location: proposal.source.location,
          evidence: proposal.source.evidence,
          note: "업로드 문서의 OpenAI 분석 근거",
          kind: "uploaded-document" as const,
        },
      };
    });

    // 구조·업무 검증이 모두 성공한 뒤에만 변경셋과 제안을 저장한다.
    await sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO change_sets (id, project_id, external_code, is_sample, source_document_ids)
        VALUES (${changeSetId}, ${projectId}, ${externalCode}, false, ${documentIds})
      `;
      for (const proposal of proposals) {
        await transaction`
          INSERT INTO change_proposals (
            id, project_id, change_set_id, external_id, change_type, requirement_code,
            title, before_content, after_content, reason, source, impact, related_requirement_codes
          ) VALUES (
            ${randomUUID()}, ${projectId}, ${changeSetId}, ${proposal.id}, ${proposal.type},
            ${proposal.requirementCode}, ${proposal.title}, ${proposal.before}, ${proposal.after},
            ${proposal.reason}, ${transaction.json(proposal.source)}, ${transaction.json(impactByProposal[proposal.id])}, ${proposal.relatedRequirementCodes ?? []}
          )
        `;
      }
    });

    return NextResponse.json({
      persistedChangeSetId: changeSetId,
      result: {
        project: { id: projectId, name: "현재 문서 분석 프로젝트", sample: false },
        changeSetId: externalCode,
        isSample: false,
        proposals,
        existingRequirements: [],
        scopes,
        impactByProposal,
      },
    });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) return NextResponse.json({ error: "분석 요청이 취소되었습니다. 변경셋은 저장되지 않았습니다." }, { status: 499 });
    if (error instanceof AiConfigurationError) return NextResponse.json({ error: `${error.missing}가 설정되지 않았습니다. 서버의 .env.local 설정을 확인해 주세요.`, code: "AI_NOT_CONFIGURED" }, { status: 503 });
    if (error instanceof ZodError || (error instanceof Error && error.message.startsWith("AI_"))) return NextResponse.json({ error: "AI 응답이 필수 구조 또는 변경 정책 검증을 통과하지 못했습니다. 변경셋은 저장되지 않았습니다.", code: "AI_VALIDATION_FAILED" }, { status: 422 });
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
    console.error("OpenAI 변경 분석 실패", { type: error instanceof Error ? error.constructor.name : "UnknownError", status });
    return NextResponse.json({ error: "OpenAI 변경 분석 요청에 실패했습니다. 잠시 후 다시 시도해 주세요. 변경셋은 저장되지 않았습니다.", code: "AI_REQUEST_FAILED" }, { status: 502 });
  }
}
