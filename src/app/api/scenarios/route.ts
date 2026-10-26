import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
    if (!isUuid(projectId)) return NextResponse.json({ error: "프로젝트 식별자가 올바르지 않습니다." }, { status: 400 });
    const sql = getDatabase();
    const scenarios = await sql`SELECT ts.*, sb.external_code AS batch_code FROM test_scenarios ts JOIN scenario_batches sb ON sb.id = ts.batch_id WHERE ts.project_id = ${projectId} ORDER BY ts.created_at DESC`;
    return NextResponse.json({ scenarios });
  } catch {
    return NextResponse.json({ error: "생성된 시나리오를 불러오지 못했습니다." }, { status: 500 });
  }
}
