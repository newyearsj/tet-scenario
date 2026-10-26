import "server-only";

const GMAIL_ADDRESS = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i;

export function getMasterEmail(): string {
  const value = process.env.MASTER_EMAIL?.trim().toLowerCase() ?? "";
  if (!value || !GMAIL_ADDRESS.test(value)) throw new Error("AUTH_SERVER_MISCONFIGURED");
  return value;
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
