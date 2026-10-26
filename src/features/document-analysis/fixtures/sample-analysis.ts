import type { ScenarioGenerationResult } from "../types";

export const sampleAnalysisResult: ScenarioGenerationResult = {
  batchId: "sample-scenario-batch",
  externalCode: "SAMPLE-TS-BATCH-001",
  isSample: true,
  scenarios: [{
    id: "sample-ts-001",
    code: "SAMPLE-TS-001",
    title: "지원 문서 등록 후 시나리오 생성 요청",
    userRole: "테스트 기획자",
    userGoal: "기획 자료를 등록하고 테스트 시나리오 초안을 생성한다.",
    relatedRequirementCodes: ["FR-DOC-01", "FR-TS-01"],
    relatedScreenIds: [],
    startCondition: "사용자가 문서 분석 화면에 접근한 상태",
    mainFlow: ["지원 형식의 문서를 한 개 이상 선택한다.", "시나리오 생성 버튼을 누른다.", "생성된 시나리오 초안과 근거를 검토한다."],
    branches: [{ condition: "문서에 화면 ID가 없음", flow: "관련 화면 ID를 비워 두고 확인 필요 여부를 검토한다.", expectedResult: "근거 없는 화면 ID가 생성되지 않는다." }],
    endCondition: "시나리오 초안이 검토 가능한 상태로 표시된다.",
    priority: "보통",
    rationale: "문서 입력에서 시나리오 초안 확인까지의 핵심 사용자 흐름을 검증한다.",
    evidence: [{ documentId: "sample-document", documentName: "PRD_TestScenarioAgent_v1.0.md", location: "문서 분석 및 테스트 시나리오 생성", quote: "기획 문서를 분석해 테스트 시나리오를 생성한다." }],
    reviewStatus: "draft",
    isSample: true,
  }],
};
