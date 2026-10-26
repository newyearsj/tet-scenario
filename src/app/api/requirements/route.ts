import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: "올바른 프로젝트 식별자가 필요합니다." }, { status: 400 });
  try {
    const sql = getDatabase();
    const rows = await sql`
      SELECT r.id, r.code, r.title, r.description, r.status, r.source_document_name, r.is_sample, r.version,
             previous.description AS previous_description, previous.status AS previous_status,
             COALESCE(jsonb_agg(jsonb_build_object('targetType', l.target_type, 'targetCode', l.target_code, 'reviewStatus', l.review_status)) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb) AS trace_links
      FROM requirements r
      LEFT JOIN requirement_trace_links l ON l.requirement_id = r.id
      LEFT JOIN LATERAL (
        SELECT rv.description, rv.status FROM requirement_versions rv
        WHERE rv.requirement_id = r.id ORDER BY rv.version DESC LIMIT 1
      ) previous ON true
      WHERE r.project_id = ${projectId}
      GROUP BY r.id, previous.description, previous.status ORDER BY r.code
    `;
    return NextResponse.json({ requirements: rows });
  } catch (error) {
    return apiError(error, "반영된 요구사항을 불러오지 못했습니다.");
  }
}
