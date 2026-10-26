import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const sql = getDatabase();
    const result = await sql.begin(async (transaction) => {
      const [changeSet] = await transaction`SELECT * FROM change_sets WHERE id = ${id} FOR UPDATE`;
      if (!changeSet) throw new Error("CHANGE_SET_NOT_FOUND");
      if (changeSet.status === "applied") throw new Error("CHANGE_SET_ALREADY_APPLIED");
      if (!changeSet.apply_scope) throw new Error("APPLY_SCOPE_REQUIRED");
      const proposals = await transaction`SELECT * FROM change_proposals WHERE change_set_id = ${id} AND selected = true ORDER BY created_at`;
      if (!proposals.length) throw new Error("PROPOSAL_REQUIRED");
      const counts = { added: 0, updated: 0, deleted: 0 };
      for (const proposal of proposals) {
        const [current] = await transaction`SELECT * FROM requirements WHERE project_id = ${changeSet.project_id} AND code = ${proposal.requirement_code} FOR UPDATE`;
        if (proposal.change_type === "add") {
          if (current || !proposal.after_content) throw new Error("INVALID_ADD_PROPOSAL");
          const requirementId = randomUUID();
          await transaction`INSERT INTO requirements (id, project_id, code, title, description, status, source_document_name, is_sample) VALUES (${requirementId}, ${changeSet.project_id}, ${proposal.requirement_code}, ${proposal.title}, ${proposal.after_content}, 'draft', ${proposal.source.documentName ?? null}, ${changeSet.is_sample})`;
          await transaction`INSERT INTO change_logs (id, project_id, change_set_id, target_type, target_id, action, after_data) VALUES (${randomUUID()}, ${changeSet.project_id}, ${id}, 'requirement', ${requirementId}, 'add', ${transaction.json({ code: proposal.requirement_code, description: proposal.after_content, status: 'draft' })})`;
          counts.added += 1;
        } else {
          if (!current) throw new Error("REQUIREMENT_NOT_FOUND");
          await transaction`INSERT INTO requirement_versions (id, project_id, requirement_id, version, title, description, status, source_document_id, source_document_name) VALUES (${randomUUID()}, ${changeSet.project_id}, ${current.id}, ${current.version}, ${current.title}, ${current.description}, ${current.status}, ${current.source_document_id}, ${current.source_document_name})`;
          const nextStatus = proposal.change_type === "delete" ? "deleted" : "draft";
          const nextDescription = proposal.change_type === "delete" ? current.description : proposal.after_content;
          await transaction`UPDATE requirements SET title = ${proposal.title}, description = ${nextDescription}, status = ${nextStatus}, source_document_name = ${proposal.source.documentName ?? current.source_document_name}, version = version + 1, updated_at = now() WHERE id = ${current.id}`;
          await transaction`INSERT INTO change_logs (id, project_id, change_set_id, target_type, target_id, action, before_data, after_data) VALUES (${randomUUID()}, ${changeSet.project_id}, ${id}, 'requirement', ${current.id}, ${proposal.change_type}, ${transaction.json({ description: current.description, status: current.status, version: current.version })}, ${transaction.json({ description: nextDescription, status: nextStatus, version: current.version + 1 })})`;
          if (changeSet.apply_scope === "requirements") await transaction`UPDATE requirement_trace_links SET review_status = 'needs_review' WHERE requirement_id = ${current.id}`;
          if (changeSet.apply_scope === "scenarios") await transaction`UPDATE requirement_trace_links SET review_status = CASE WHEN target_type = 'scenario' THEN 'draft' ELSE 'needs_review' END WHERE requirement_id = ${current.id}`;
          if (changeSet.apply_scope === "testCases") await transaction`UPDATE requirement_trace_links SET review_status = 'draft' WHERE requirement_id = ${current.id}`;
          if (proposal.change_type === "delete") counts.deleted += 1; else counts.updated += 1;
        }
      }
      await transaction`UPDATE change_sets SET status = 'applied', applied_at = now(), updated_at = now() WHERE id = ${id}`;
      await transaction`INSERT INTO change_logs (id, project_id, change_set_id, target_type, action, after_data) VALUES (${randomUUID()}, ${changeSet.project_id}, ${id}, 'change_set', 'apply', ${transaction.json({ scope: changeSet.apply_scope, selectedCount: proposals.length, sample: changeSet.is_sample })})`;
      return { ...counts, scope: changeSet.apply_scope, sample: changeSet.is_sample };
    });
    return NextResponse.json({ summary: result });
  } catch (error) {
    if (error instanceof Error && error.message === "CHANGE_SET_ALREADY_APPLIED") return NextResponse.json({ error: "이미 반영된 변경셋은 다시 반영할 수 없습니다." }, { status: 409 });
    if (error instanceof Error && ["APPLY_SCOPE_REQUIRED", "PROPOSAL_REQUIRED"].includes(error.message)) return NextResponse.json({ error: "제안과 반영 범위를 먼저 선택해 주세요." }, { status: 400 });
    return apiError(error, "변경 반영에 실패했습니다. 어떤 항목도 부분 반영되지 않았습니다.");
  }
}
