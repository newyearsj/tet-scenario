import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
  if (!isUuid(projectId)) return NextResponse.json({ error: "올바른 프로젝트 식별자가 필요합니다." }, { status: 400 });
  try {
    const sql = getDatabase();
    const rows = await sql`SELECT id, external_code, status, apply_scope, is_sample, applied_at, created_at FROM change_sets WHERE project_id = ${projectId} ORDER BY created_at DESC`;
    return NextResponse.json({ changeSets: rows });
  } catch (error) {
    return apiError(error, "변경셋을 불러오지 못했습니다.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, externalCode, isSample, sourceDocumentIds, proposals, existingRequirements } = body;
    if (!isUuid(projectId) || typeof externalCode !== "string" || !Array.isArray(proposals) || !Array.isArray(existingRequirements)) return NextResponse.json({ error: "변경셋 데이터가 올바르지 않습니다." }, { status: 400 });
    const sql = getDatabase();
    const changeSetId = randomUUID();
    const saved = await sql.begin(async (transaction) => {
      await transaction`INSERT INTO projects (id, name, is_sample) VALUES (${projectId}, NULL, ${Boolean(isSample)}) ON CONFLICT (id) DO NOTHING`;
      const existing = await transaction`SELECT id, status FROM change_sets WHERE project_id = ${projectId} AND external_code = ${externalCode} FOR UPDATE`;
      if (existing[0]?.status === "applied") throw new Error("CHANGE_SET_ALREADY_APPLIED");
      const internalId = existing[0]?.id ?? changeSetId;
      if (!existing.length) {
        await transaction`INSERT INTO change_sets (id, project_id, external_code, is_sample, source_document_ids) VALUES (${internalId}, ${projectId}, ${externalCode}, ${Boolean(isSample)}, ${sourceDocumentIds ?? []})`;
      }
      for (const requirement of existingRequirements) {
        const requirementId = randomUUID();
        const [savedRequirement] = await transaction`
          INSERT INTO requirements (id, project_id, code, title, description, status, source_document_name, is_sample, version)
          VALUES (${requirementId}, ${projectId}, ${requirement.code}, ${requirement.title}, ${requirement.description}, ${mapStatus(requirement.status)}, ${requirement.sourceDocument ?? null}, ${Boolean(requirement.sample)}, ${requirement.version ?? 1})
          ON CONFLICT (project_id, code) DO UPDATE SET updated_at = requirements.updated_at
          RETURNING id
        `;
        const links = requirement.traceLinks ?? { scenarioIds: [], testCaseIds: [] };
        for (const targetCode of links.scenarioIds ?? []) await transaction`INSERT INTO requirement_trace_links (id, project_id, requirement_id, target_type, target_code) VALUES (${randomUUID()}, ${projectId}, ${savedRequirement.id}, 'scenario', ${targetCode}) ON CONFLICT DO NOTHING`;
        for (const targetCode of links.testCaseIds ?? []) await transaction`INSERT INTO requirement_trace_links (id, project_id, requirement_id, target_type, target_code) VALUES (${randomUUID()}, ${projectId}, ${savedRequirement.id}, 'test_case', ${targetCode}) ON CONFLICT DO NOTHING`;
      }
      for (const proposal of proposals) {
        if (!['add', 'update', 'delete'].includes(proposal.type)) throw new Error("INVALID_CHANGE_TYPE");
        await transaction`
          INSERT INTO change_proposals (id, project_id, change_set_id, external_id, change_type, requirement_code, title, before_content, after_content, reason, source, impact, related_requirement_codes)
          VALUES (${randomUUID()}, ${projectId}, ${internalId}, ${proposal.id}, ${proposal.type}, ${proposal.requirementCode}, ${proposal.title}, ${proposal.before}, ${proposal.after}, ${proposal.reason}, ${transaction.json(proposal.source)}, ${transaction.json(proposal.impact ?? {})}, ${proposal.relatedRequirementCodes ?? []})
          ON CONFLICT (change_set_id, external_id) DO NOTHING
        `;
      }
      return internalId;
    });
    return NextResponse.json({ changeSetId: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CHANGE_SET_ALREADY_APPLIED") return NextResponse.json({ error: "이미 반영된 샘플 변경셋입니다." }, { status: 409 });
    return apiError(error, "변경 제안을 저장하지 못했습니다.");
  }
}

function mapStatus(status: string) {
  return status === "삭제" ? "deleted" : status === "초안" ? "draft" : "active";
}
