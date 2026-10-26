import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
    const scope = body.scope ?? null;
    if (scope && !["requirements", "scenarios", "testCases"].includes(scope)) return NextResponse.json({ error: "반영 범위가 올바르지 않습니다." }, { status: 400 });
    const sql = getDatabase();
    await sql.begin(async (transaction) => {
      const rows = await transaction`SELECT status FROM change_sets WHERE id = ${id} FOR UPDATE`;
      if (!rows.length) throw new Error("CHANGE_SET_NOT_FOUND");
      if (rows[0].status === "applied") throw new Error("CHANGE_SET_ALREADY_APPLIED");
      await transaction`UPDATE change_proposals SET selected = external_id = ANY(${selectedIds}) WHERE change_set_id = ${id}`;
      await transaction`UPDATE change_sets SET apply_scope = ${scope}, status = 'reviewing', updated_at = now() WHERE id = ${id}`;
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    if (error instanceof Error && error.message === "CHANGE_SET_ALREADY_APPLIED") return NextResponse.json({ error: "이미 반영된 변경셋입니다." }, { status: 409 });
    return apiError(error, "선택 상태를 저장하지 못했습니다.");
  }
}
