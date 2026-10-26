import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveProjectId(request: NextRequest) {
  const urlId = request.nextUrl.searchParams.get("projectId");
  if (urlId) return urlId;
  const changeMatch = request.nextUrl.pathname.match(/^\/api\/change-sets\/([0-9a-f-]{36})(?:\/apply)?$/i);
  const testCaseMatch = request.nextUrl.pathname.match(/^\/api\/test-cases\/([0-9a-f-]{36})$/i);
  const sql = getDatabase();
  if (changeMatch) return String((await sql`SELECT project_id FROM change_sets WHERE id=${changeMatch[1]}`)[0]?.project_id ?? "");
  if (testCaseMatch) return String((await sql`SELECT project_id FROM test_cases WHERE id=${testCaseMatch[1]}`)[0]?.project_id ?? "");
  if (!["GET", "HEAD"].includes(request.method)) {
    const contentType = request.headers.get("content-type") ?? "";
    try {
      if (contentType.includes("application/json")) {
        const body = await request.clone().json();
        if (typeof body.projectId === "string") return body.projectId;
        if (typeof body.id === "string" && request.nextUrl.pathname === "/api/workspace") return String((await sql`SELECT project_id FROM review_questions WHERE id=${body.id}`)[0]?.project_id ?? "");
      }
      if (contentType.includes("multipart/form-data")) return String((await request.clone().formData()).get("projectId") ?? "");
    } catch { return ""; }
  }
  return "";
}

export default auth(async (request) => {
  if (request.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (!request.auth?.serverSessionValid || !request.auth.user?.id) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }
  const projectId = await resolveProjectId(request);
  if (projectId && UUID.test(projectId)) {
    const sql = getDatabase();
    const project = await sql`SELECT owner_user_id FROM projects WHERE id=${projectId}`;
    if (!project[0]) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    if (project[0] && project[0].owner_user_id !== request.auth.user.id) return NextResponse.json({ error: "이 프로젝트에 접근할 권한이 없습니다." }, { status: 403 });
  }
  return NextResponse.next();
});

export const config = { matcher: ["/api/:path*"] };
