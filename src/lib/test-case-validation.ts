export const reviewStatuses = ["draft", "needs_review", "reviewed", "approved", "excluded", "re_review"] as const;
export const testLevels = ["기능", "통합", "인수"] as const;
export const perspectives = ["정상", "예외", "경계", "권한", "상태 전이", "비기능"] as const;

export function cleanText(value: unknown, max = 10000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

export function cleanList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => cleanText(item, 2000)).filter(Boolean) : [];
}

export function cleanSteps(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { number: Number(row.number), action: cleanText(row.action, 4000), expectedResult: cleanText(row.expectedResult, 4000), index };
  });
}

export function validateSteps(steps: ReturnType<typeof cleanSteps>) {
  return steps.length > 0 && steps.every((step, index) => step.number === index + 1 && Boolean(step.action) && Boolean(step.expectedResult)) && new Set(steps.map((step) => step.number)).size === steps.length;
}

export function redactForLog(value: unknown): unknown {
  if (typeof value === "string") return value
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[DB 연결정보 마스킹]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "***@***.***")
    .replace(/(?:api[_ -]?key|token|password|비밀번호|master_email)\s*[:=]\s*[^\s,;]+/gi, "$1: [마스킹]");
  if (Array.isArray(value)) return value.map(redactForLog);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [/key|token|password|master_email/i.test(key) ? key : key, /key|token|password|master_email/i.test(key) ? "[마스킹]" : redactForLog(item)]));
  return value;
}
