import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";

export const SERVER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createServerSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SERVER_SESSION_MAX_AGE_SECONDS * 1000);
  const sql = getDatabase();
  await sql`INSERT INTO server_sessions (id,user_id,token_hash,expires_at) VALUES (${id},${userId},${hashToken(token)},${expiresAt})`;
  return { id, token, expiresAt };
}

export async function validateServerSession(userId: string, token: string) {
  if (!userId || !token) return false;
  const sql = getDatabase();
  const rows = await sql`
    UPDATE server_sessions SET last_used_at=now()
    WHERE user_id=${userId} AND token_hash=${hashToken(token)}
      AND revoked_at IS NULL AND expires_at > now()
    RETURNING id
  `;
  return rows.length === 1;
}

export async function revokeServerSession(userId: string, token: string) {
  if (!userId || !token) return;
  const sql = getDatabase();
  await sql`UPDATE server_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=${userId} AND token_hash=${hashToken(token)}`;
}
