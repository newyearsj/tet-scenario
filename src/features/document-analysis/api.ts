import type { ScenarioGenerationResult, TestScenario } from "./types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "서버 요청을 처리하지 못했습니다.");
  return body as T;
}

export interface SavedDocument {
  id: string;
  file_name: string;
  file_size_bytes: number;
  original_character_count: number;
  analyzed_character_count: number;
  unanalyzed_character_count: number;
  parse_status: "parsed" | "over_limit" | "empty" | "failed";
}

export async function uploadDocuments(projectId: string, files: File[], signal?: AbortSignal) {
  const formData = new FormData();
  formData.set("projectId", projectId);
  files.forEach((file) => formData.append("files", file));
  return requestJson<{ documents: SavedDocument[] }>("/api/documents", { method: "POST", body: formData, signal });
}

export async function generateActualScenarios(projectId: string, documentIds: string[], signal?: AbortSignal) {
  return requestJson<ScenarioGenerationResult>("/api/analysis/scenarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, documentIds }),
    signal,
  });
}

interface DatabaseScenario {
  id: string; code: string; title: string; user_role: string; user_goal: string;
  related_requirement_codes: string[]; related_screen_ids: string[]; start_condition: string;
  main_flow: string[]; branches: TestScenario["branches"]; end_condition: string;
  priority: TestScenario["priority"]; rationale: string; evidence: TestScenario["evidence"];
  review_status: TestScenario["reviewStatus"]; is_sample: boolean; batch_code: string;
}

export async function loadScenarios(projectId: string): Promise<TestScenario[]> {
  const data = await requestJson<{ scenarios: DatabaseScenario[] }>(`/api/scenarios?projectId=${encodeURIComponent(projectId)}`);
  return data.scenarios.map((item) => ({
    id: item.id, code: item.code, title: item.title, userRole: item.user_role, userGoal: item.user_goal,
    relatedRequirementCodes: item.related_requirement_codes, relatedScreenIds: item.related_screen_ids,
    startCondition: item.start_condition, mainFlow: item.main_flow, branches: item.branches,
    endCondition: item.end_condition, priority: item.priority, rationale: item.rationale,
    evidence: item.evidence, reviewStatus: item.review_status, isSample: item.is_sample, batchCode: item.batch_code,
  }));
}
