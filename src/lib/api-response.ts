import { NextResponse } from "next/server";

export function apiError(error: unknown, fallback: string, status = 500) {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (code === "DATABASE_NOT_CONFIGURED") return NextResponse.json({ error: "데이터베이스 연결이 설정되지 않았습니다." }, { status: 503 });
  console.error("서버 작업 실패", { code: code.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED]") });
  return NextResponse.json({ error: fallback }, { status });
}
