import { NextResponse } from "next/server";
import { accessErrorResponse, requireUser } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const sql = getDatabase();
    const projects = await sql`
      SELECT p.id,p.name,p.target_service_description,p.is_default,p.created_at,p.updated_at,
        (SELECT count(*)::int FROM documents d WHERE d.project_id=p.id) document_count,
        (SELECT count(*)::int FROM test_scenarios s WHERE s.project_id=p.id) scenario_count,
        (SELECT count(*)::int FROM test_cases tc WHERE tc.project_id=p.id) test_case_count,
        (SELECT count(*)::int FROM review_questions q WHERE q.project_id=p.id AND q.status IN ('open','answered')) review_count
      FROM projects p WHERE p.owner_user_id=${user.id}
      ORDER BY p.is_default DESC,p.updated_at DESC,p.created_at
    `;
    return NextResponse.json({ projects });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "프로젝트 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";
    if (!name) return NextResponse.json({ error: "프로젝트명을 입력해 주세요." }, { status: 400 });
    const sql = getDatabase();
    const [project] = await sql`INSERT INTO projects (id,name,target_service_description,owner_user_id,is_sample,is_default) VALUES (${randomUUID()},${name},${description || null},${user.id},false,false) RETURNING id,name,target_service_description,is_default,created_at,updated_at`;
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "프로젝트를 만들지 못했습니다." }, { status: 500 });
  }
}
