import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error("마이그레이션 실패: DIRECT_URL이 설정되지 않았습니다.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(directUrl);
} catch {
  console.error("마이그레이션 실패: DIRECT_URL 형식이 올바르지 않습니다.");
  process.exit(1);
}

if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
  console.error("마이그레이션 실패: PostgreSQL 연결 문자열이 아닙니다.");
  process.exit(1);
}

const looksLikeSupabase = parsed.hostname.endsWith("supabase.co") || parsed.hostname.endsWith("pooler.supabase.com");
if (!looksLikeSupabase) {
  console.error("마이그레이션 실패: DIRECT_URL이 Supabase PostgreSQL 주소인지 확인해 주세요.");
  process.exit(1);
}

const sql = postgres(directUrl, { ssl: "require", max: 1, prepare: false, connect_timeout: 15, onnotice: () => undefined });

try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  const migrationDirectory = path.join(process.cwd(), "migrations");
  const files = (await fs.readdir(migrationDirectory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
  for (const file of files) {
    const applied = await sql`SELECT 1 FROM schema_migrations WHERE name = ${file}`;
    if (applied.length) {
      console.log(`건너뜀: ${file}`);
      continue;
    }
    const body = await fs.readFile(path.join(migrationDirectory, file), "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(body);
      await transaction`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`적용 완료: ${file}`);
  }
  console.log("DB 마이그레이션이 완료되었습니다.");
} catch (error) {
  const safeName = error && typeof error === "object" && "file" in error ? String(error.file) : "현재 마이그레이션";
  console.error(`마이그레이션 실패: ${safeName}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
