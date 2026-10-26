export type AnalysisTab = "documents" | "review";

export interface ScenarioEvidence {
  documentId: string;
  documentName: string;
  location: string;
  quote: string;
}

export interface ScenarioBranch {
  condition: string;
  flow: string;
  expectedResult: string;
}

export interface TestScenario {
  id: string;
  code: string;
  title: string;
  userRole: string;
  userGoal: string;
  relatedRequirementCodes: string[];
  relatedScreenIds: string[];
  startCondition: string;
  mainFlow: string[];
  branches: ScenarioBranch[];
  endCondition: string;
  priority: "높음" | "보통" | "낮음" | "확인 필요";
  rationale: string;
  evidence: ScenarioEvidence[];
  reviewStatus: "draft" | "needs_review";
  isSample: boolean;
  batchCode?: string;
}

export interface ScenarioGenerationResult {
  batchId: string;
  externalCode: string;
  isSample: boolean;
  scenarios: TestScenario[];
}
