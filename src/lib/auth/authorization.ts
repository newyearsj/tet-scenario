import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDatabase } from "@/lib/db";

export class AccessError extends Error {
  constructor(public status: 401 | 403 | 404, message: string) { super(message); }
}

export async function requireUser() {
  const session = await auth();
  if (!session?.serverSessionValid || !session.user?.id) throw new AccessError(401, "로그인이 필요합니다.");
  return { id: session.user.id, email: session.user.email };
}

export async function requireOwnedProject(projectId: string) {
  const user = await requireUser();
  const sql = getDatabase();
  const rows = await sql`SELECT id,name FROM projects WHERE id=${projectId}`;
  if (!rows[0]) throw new AccessError(404, "프로젝트를 찾을 수 없습니다.");
  const owned = await sql`SELECT id,name FROM projects WHERE id=${projectId} AND owner_user_id=${user.id}`;
  if (!owned[0]) throw new AccessError(403, "이 프로젝트에 접근할 권한이 없습니다.");
  return { user, project: owned[0] };
}

export async function requireOwnedEntity(kind: "change_set" | "test_case" | "review_question", id: string) {
  const user = await requireUser();
  const sql = getDatabase();
  const rows = kind === "change_set"
    ? await sql`SELECT cs.project_id,p.owner_user_id FROM change_sets cs JOIN projects p ON p.id=cs.project_id WHERE cs.id=${id}`
    : kind === "test_case"
      ? await sql`SELECT tc.project_id,p.owner_user_id FROM test_cases tc JOIN projects p ON p.id=tc.project_id WHERE tc.id=${id}`
      : await sql`SELECT q.project_id,p.owner_user_id FROM review_questions q JOIN projects p ON p.id=q.project_id WHERE q.id=${id}`;
  if (!rows[0]) throw new AccessError(404, "요청한 데이터를 찾을 수 없습니다.");
  if (rows[0].owner_user_id !== user.id) throw new AccessError(403, "이 데이터에 접근할 권한이 없습니다.");
  return { user, projectId: String(rows[0].project_id) };
}

export function accessErrorResponse(error: unknown) {
  return error instanceof AccessError ? NextResponse.json({ error: error.message }, { status: error.status }) : null;
}
