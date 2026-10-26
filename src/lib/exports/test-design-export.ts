import ExcelJS from "exceljs";

export const EXPORT_SHEETS = ["요약·범위", "테스트 시나리오", "테스트 케이스", "추적표", "확인 질문", "변경 영향"] as const;
export const REVIEW_STATUSES = ["draft", "needs_review", "reviewed", "approved", "excluded", "re_review"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];
type ExportOptions = { reviewStatuses: ReviewStatus[]; includeSamples: boolean; approvedOnly: boolean };
type JsonRecord = Record<string, unknown>;

const reviewLabel: Record<string, string> = { draft: "초안", needs_review: "확인 필요", reviewed: "검토 완료", approved: "승인", excluded: "제외", re_review: "재검토 필요" };
const executionLabel: Record<string, string> = { not_run: "미실행" };
const questionLabel: Record<string, string> = { policy_missing: "정책 누락", document_conflict: "문서 충돌", condition_missing: "조건 누락", reference_error: "참조 오류", open: "미답변", answered: "답변됨", decided: "결정됨", deferred: "보류" };
const changeLabel: Record<string, string> = { add: "추가", update: "수정", delete: "삭제", draft: "초안", reviewing: "검토 중", applied: "반영 완료", failed: "실패", requirements: "요구사항까지", scenarios: "시나리오까지", testCases: "테스트 케이스까지" };

export class ExportValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) { super("EXPORT_VALIDATION_FAILED"); this.issues = issues; }
}

export async function loadTestDesignExport(projectId: string, options: ExportOptions) {
  const { getDatabase } = await import("@/lib/db");
  const sql = getDatabase();
  const [project] = await sql`SELECT id, name, target_service_description FROM projects WHERE id=${projectId}`;
  if (!project) throw new ExportValidationError(["현재 프로젝트를 찾을 수 없습니다."]);
  const sampleClause = options.includeSamples;
  const documents = await sql`SELECT id,file_name,document_version,analyzed_character_count,unanalyzed_character_count,parse_status,source_map FROM documents WHERE project_id=${projectId} ORDER BY uploaded_at`;
  const requirements = await sql`SELECT * FROM requirements WHERE project_id=${projectId} AND (${sampleClause} OR is_sample=false) ORDER BY code`;
  const scenarios = await sql`SELECT * FROM test_scenarios WHERE project_id=${projectId} AND (${sampleClause} OR is_sample=false) ORDER BY code`;
  const allTestCases = await sql`SELECT tc.*,ts.code scenario_code FROM test_cases tc LEFT JOIN test_scenarios ts ON ts.id=tc.scenario_id WHERE tc.project_id=${projectId} ORDER BY tc.code,tc.version`;
  const selectedStatuses = options.approvedOnly ? ["approved"] : options.reviewStatuses;
  const testCases = allTestCases.filter((item) => selectedStatuses.includes(String(item.review_status) as ReviewStatus));
  const questions = await sql`SELECT * FROM review_questions WHERE project_id=${projectId} ORDER BY code`;
  const changeImpacts = await sql`SELECT cs.external_code,cs.status change_set_status,cs.apply_scope,cs.is_sample,cs.applied_at,cp.* FROM change_proposals cp JOIN change_sets cs ON cs.id=cp.change_set_id WHERE cp.project_id=${projectId} AND (${sampleClause} OR cs.is_sample=false) ORDER BY cs.created_at,cp.external_id`;
  return { project, documents, requirements, scenarios, allTestCases, testCases, questions, changeImpacts, options };
}

export function summarizeExport(data: Awaited<ReturnType<typeof loadTestDesignExport>>) {
  const activeRequirements = data.requirements.filter((r) => r.status !== "deleted");
  const coveredCodes = new Set(data.allTestCases.filter((tc) => ["reviewed", "approved"].includes(String(tc.review_status))).flatMap((tc) => stringArray(tc.related_requirement_codes)));
  const covered = activeRequirements.filter((r) => coveredCodes.has(String(r.code))).length;
  const statusCounts = Object.fromEntries(REVIEW_STATUSES.map((status) => [status, data.allTestCases.filter((tc) => tc.review_status === status).length]));
  return {
    projectName: data.project.name || "이름 미정 프로젝트",
    requirementCount: activeRequirements.length,
    scenarioCount: data.scenarios.length,
    totalTestCaseCount: data.allTestCases.length,
    includedTestCaseCount: data.testCases.length,
    questionCount: data.questions.length,
    openQuestionCount: data.questions.filter((q) => ["open", "answered"].includes(String(q.status))).length,
    changeImpactCount: data.changeImpacts.length,
    uncoveredCount: activeRequirements.length - covered,
    coverageNumerator: covered,
    coverageDenominator: activeRequirements.length,
    statusCounts,
  };
}

export function validateExport(data: Awaited<ReturnType<typeof loadTestDesignExport>>) {
  const issues: string[] = [];
  const requirementCodes = new Set(data.requirements.map((r) => String(r.code)));
  const scenarioCodes = new Set(data.scenarios.map((s) => String(s.code)));
  const questionCodes = new Set(data.questions.map((q) => String(q.code)));
  const knownScreens = new Set([...data.scenarios, ...data.allTestCases, ...data.questions].flatMap((item) => stringArray(item.related_screen_ids)));
  for (const scenario of data.scenarios) {
    for (const code of stringArray(scenario.related_requirement_codes)) if (!requirementCodes.has(code)) issues.push(`${scenario.code}: 존재하지 않는 요구사항 ${code}를 참조합니다.`);
    for (const evidence of recordArray(scenario.evidence)) validateEvidence(evidence, data.documents, `${scenario.code}`, issues);
  }
  for (const tc of data.testCases) {
    if (tc.scenario_code && !scenarioCodes.has(String(tc.scenario_code))) issues.push(`${tc.code}: 존재하지 않는 시나리오를 참조합니다.`);
    for (const code of stringArray(tc.related_requirement_codes)) if (!requirementCodes.has(code)) issues.push(`${tc.code}: 존재하지 않는 요구사항 ${code}를 참조합니다.`);
    for (const screen of stringArray(tc.related_screen_ids)) if (!knownScreens.has(screen)) issues.push(`${tc.code}: 프로젝트 내부에서 확인되지 않은 화면 ${screen}을 참조합니다.`);
    for (const code of stringArray(tc.question_codes)) if (!questionCodes.has(code)) issues.push(`${tc.code}: 존재하지 않는 확인 질문 ${code}를 참조합니다.`);
    const steps = recordArray(tc.steps);
    const numbers = steps.map((step) => Number(step.number));
    if (!steps.length || numbers.some((number, index) => number !== index + 1) || new Set(numbers).size !== numbers.length || steps.some((step) => !text(step.action) || !text(step.expectedResult))) issues.push(`${tc.code}: 수행 단계 번호 또는 단계별 기대 결과가 올바르지 않습니다.`);
    if (tc.execution_status !== "not_run") issues.push(`${tc.code}: 현재 제품 범위에서 허용되지 않는 실행 상태입니다.`);
    const hasOpenQuestion = stringArray(tc.question_codes).some((code) => data.questions.some((q) => q.code === code && ["open", "answered"].includes(String(q.status))));
    if (hasOpenQuestion && tc.review_status === "approved") issues.push(`${tc.code}: 미결 확인 질문에 의존하는 승인 케이스입니다.`);
    for (const evidence of recordArray(tc.evidence)) validateEvidence(evidence, data.documents, `${tc.code}`, issues);
  }
  if (issues.length) throw new ExportValidationError([...new Set(issues)]);
}

export async function buildTestDesignWorkbook(data: Awaited<ReturnType<typeof loadTestDesignExport>>) {
  validateExport(data);
  const summary = summarizeExport(data);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TestScenarioAgent";
  workbook.created = new Date();
  const now = new Date();
  const rowsBySheet: Record<(typeof EXPORT_SHEETS)[number], JsonRecord[]> = {
    "요약·범위": summaryRows(data, summary, now),
    "테스트 시나리오": scenarioRows(data),
    "테스트 케이스": testCaseRows(data),
    "추적표": traceRows(data),
    "확인 질문": questionRows(data),
    "변경 영향": changeRows(data),
  };
  for (const sheetName of EXPORT_SHEETS) appendSheet(workbook, sheetName, rowsBySheet[sheetName]);
  if (workbook.worksheets.map((sheet) => sheet.name).join("|") !== EXPORT_SHEETS.join("|")) throw new ExportValidationError(["필수 시트 구성이 올바르지 않습니다."]);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(arrayBuffer), fileName: `${safeFileName(summary.projectName)}_테스트설계산출물_${stamp(now)}.xlsx`, summary };
}

function summaryRows(data: Awaited<ReturnType<typeof loadTestDesignExport>>, summary: ReturnType<typeof summarizeExport>, now: Date): JsonRecord[] {
  const documents = data.documents.map((d) => `${d.file_name} (v${d.document_version})`).join("\n") || "해당 데이터 없음";
  const analyzed = data.documents.reduce((sum, d) => sum + Number(d.analyzed_character_count), 0);
  const unanalyzed = data.documents.reduce((sum, d) => sum + Number(d.unanalyzed_character_count), 0);
  return [
    { 항목: "프로젝트명", 내용: summary.projectName }, { 항목: "대상 서비스 설명", 내용: data.project.target_service_description || "확인 필요" },
    { 항목: "산출 일시", 내용: formatDate(now) }, { 항목: "포함 문서", 내용: documents },
    { 항목: "분석 범위", 내용: `${analyzed.toLocaleString("ko-KR")}자` }, { 항목: "미분석 범위", 내용: `${unanalyzed.toLocaleString("ko-KR")}자` },
    { 항목: "요구사항 수", 내용: summary.requirementCount }, { 항목: "시나리오 수", 내용: summary.scenarioCount },
    { 항목: "전체 테스트 케이스 수", 내용: summary.totalTestCaseCount }, { 항목: "포함된 테스트 케이스 수", 내용: summary.includedTestCaseCount },
    { 항목: "미결 확인 질문 수", 내용: summary.openQuestionCount }, { 항목: "미커버 요구사항 수", 내용: summary.uncoveredCount },
    ...REVIEW_STATUSES.map((status) => ({ 항목: `${reviewLabel[status]} 케이스 수`, 내용: summary.statusCounts[status] })),
    { 항목: "테스트 실행 상태", 내용: `미실행 ${summary.totalTestCaseCount}건` },
    { 항목: "설계 커버리지", 내용: summary.coverageDenominator ? `${summary.coverageNumerator}/${summary.coverageDenominator} (${Math.round(summary.coverageNumerator / summary.coverageDenominator * 100)}%)` : "산정 불가" },
    { 항목: "커버리지 산정 기준", 내용: "활성 요구사항 중 검토 완료 또는 승인 테스트 케이스가 1건 이상 연결된 고유 요구사항" },
    { 항목: "제외 범위와 사유", 내용: "프로젝트에 저장된 명시적 제외 사유가 있는 항목만 제외로 표시" },
    { 항목: "검토 시 유의사항", 내용: "AI 생성 결과는 검토용 초안입니다. 테스트 실행 결과가 아니며 미결 질문과 미커버 범위를 함께 검토해야 합니다." },
  ];
}

function scenarioRows(data: Awaited<ReturnType<typeof loadTestDesignExport>>) { return data.scenarios.map((s) => ({
  "시나리오 ID": s.code, 제목: s.title, "사용자 역할": s.user_role, "사용자 목적": s.user_goal,
  "관련 요구사항 코드": joinCodes(s.related_requirement_codes), "관련 화면 ID": joinCodes(s.related_screen_ids), "시작 조건": s.start_condition,
  "주요 흐름": numbered(s.main_flow), 분기: recordArray(s.branches).map((b, i) => `${i + 1}. ${text(b.condition)}: ${text(b.flow)} / 기대: ${text(b.expectedResult)}`).join("\n"),
  "종료 조건": s.end_condition, 우선순위: s.priority, "생성 유형": s.is_sample ? "fixture 샘플" : "OpenAI 실제 생성", "검토 상태": reviewLabel[String(s.review_status)] || s.review_status,
  "원문 근거": evidenceText(s.evidence), "확인 필요 사항": s.review_status === "needs_review" ? "확인 필요" : "없음",
})); }

function testCaseRows(data: Awaited<ReturnType<typeof loadTestDesignExport>>) { return data.testCases.map((tc) => ({
  "TC ID": tc.code, 버전: `v${tc.version}`, "관련 시나리오 ID": tc.scenario_code || "연결 없음", 제목: tc.title, "검증 목적": tc.objective,
  "테스트 수준": tc.test_level, "검증 관점": tc.perspective, 우선순위: tc.priority, "우선순위 사유": tc.priority_reason,
  "관련 요구사항 코드": joinCodes(tc.related_requirement_codes), "관련 화면 ID": joinCodes(tc.related_screen_ids), 사전조건: numbered(tc.preconditions),
  "테스트 데이터": numbered(tc.test_data), "수행 단계": recordArray(tc.steps).map((s) => `${s.number}. ${mask(text(s.action))}`).join("\n"),
  "단계별 기대 결과": recordArray(tc.steps).map((s) => `${s.number}. ${mask(text(s.expectedResult))}`).join("\n"), "원문 근거": evidenceText(tc.evidence),
  "관련 확인 질문": joinCodes(tc.question_codes), "검토 상태": reviewLabel[String(tc.review_status)] || tc.review_status, "실행 상태": executionLabel[String(tc.execution_status)] || "미실행",
  "생성 유형": sourceLabel(String(tc.creation_source)), "생성 일시": formatDate(tc.created_at), "수정 일시": formatDate(tc.updated_at),
})); }

function traceRows(data: Awaited<ReturnType<typeof loadTestDesignExport>>) { return data.requirements.map((r) => {
  const scenarios = data.scenarios.filter((s) => stringArray(s.related_requirement_codes).includes(String(r.code)));
  const cases = data.allTestCases.filter((tc) => stringArray(tc.related_requirement_codes).includes(String(r.code)));
  const statuses = cases.map((tc) => String(tc.review_status));
  const coverage = r.status === "deleted" ? "제외" : statuses.includes("approved") ? "승인 연결" : statuses.includes("reviewed") ? "검토 완료 연결" : statuses.includes("needs_review") || statuses.includes("re_review") ? "확인 필요" : cases.length ? "초안 연결" : "미커버";
  return { "요구사항 코드": r.code, 요구사항명: r.title, "수용 기준": r.description, "관련 화면 ID": joinCodes(scenarios.flatMap((s) => stringArray(s.related_screen_ids))),
    "관련 시나리오 ID": scenarios.map((s) => s.code).join(", "), "관련 테스트 케이스 ID": cases.map((tc) => tc.code).join(", "), "테스트 케이스 검토 상태": [...new Set(statuses.map((s) => reviewLabel[s] || s))].join(", "),
    "원문 근거": r.source_document_name || "확인 필요", "커버리지 상태": coverage, "미커버·제외·테스트 불가 사유": coverage === "미커버" ? "연결된 테스트 케이스 없음" : r.status === "deleted" ? "삭제 상태 요구사항" : "" };
}); }

function questionRows(data: Awaited<ReturnType<typeof loadTestDesignExport>>) { return data.questions.map((q) => ({
  "질문 코드": q.code, "질문 유형": questionLabel[String(q.question_type)] || q.question_type, "질문 내용": q.question, "관련 요구사항 코드": joinCodes(q.related_requirement_codes),
  "관련 화면 ID": joinCodes(q.related_screen_ids), "관련 테스트 케이스 ID": data.allTestCases.filter((tc) => stringArray(tc.question_codes).includes(String(q.code))).map((tc) => tc.code).join(", "),
  "충돌 또는 누락 근거": evidenceText(q.evidence), 상태: questionLabel[String(q.status)] || q.status, "사용자 답변": q.answer || "", "결정 사유": q.decision_reason || "", "결정 일시": formatDate(q.decided_at),
})); }

function changeRows(data: Awaited<ReturnType<typeof loadTestDesignExport>>) { return data.changeImpacts.map((c) => { const impact = record(c.impact); return {
  "변경셋 코드": c.external_code, "변경 유형": changeLabel[String(c.change_type)] || c.change_type, "대상 요구사항 코드": c.requirement_code, "변경 전 내용": c.before_content || "", "변경 후 내용": c.after_content || "",
  "변경 사유": c.reason, "변경 근거": evidenceText([record(c.source)]), "영향 시나리오": joinCodes(impact.scenarioCodes), "직접 영향 테스트 케이스": joinCodes(impact.directTestCaseCodes),
  "의존 영향 테스트 케이스": joinCodes(impact.dependentTestCaseCodes), "선택 여부": c.selected ? "선택" : "미선택", "반영 범위": changeLabel[String(c.apply_scope)] || c.apply_scope || "미선택",
  "반영 상태": changeLabel[String(c.change_set_status)] || c.change_set_status, "반영 일시": formatDate(c.applied_at),
}; }); }

function appendSheet(workbook: ExcelJS.Workbook, name: string, rows: JsonRecord[]) {
  const actualRows = rows.length ? rows.map(sanitizeRecord) : [{ 안내: "해당 데이터 없음" }];
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = Object.keys(actualRows[0]);
  sheet.columns = headers.map((header) => ({ header, key: header, width: Math.min(60, Math.max(12, header.length + 2, ...actualRows.map((row) => String(row[header] ?? "").split("\n").reduce((max, line) => Math.max(max, line.length + 2), 0)))) }));
  for (const row of actualRows) sheet.addRow(row);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: headers.length } };
  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1769E0" } }; cell.alignment = { vertical: "middle", wrapText: true }; });
  sheet.eachRow((row, rowNumber) => { if (rowNumber > 1) { row.alignment = { vertical: "top", wrapText: true }; const heights: number[] = []; row.eachCell((cell) => heights.push(String(cell.value ?? "").split("\n").length * 15)); row.height = Math.min(90, Math.max(18, ...heights)); } });
}

function sanitizeRecord(row: JsonRecord) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? safeCell(mask(value)) : value])); }
function safeCell(value: string) { const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 32767); return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned; }
function mask(value: string) { return value.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "***@***.***").replace(/(?:api[_ -]?key|token|password|비밀번호)\s*[:=]\s*[^\s,;]+/gi, "$1: [마스킹]"); }
function safeFileName(value: string) { return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/[. ]+$/g, "").slice(0, 80) || "프로젝트"; }
function stamp(date: Date) { const p = (n: number) => String(n).padStart(2, "0"); return `${date.getFullYear()}${p(date.getMonth()+1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`; }
function formatDate(value: unknown) { if (!value) return ""; const date = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(date); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function recordArray(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && Boolean(v.trim())) : []; }
function joinCodes(value: unknown) { return [...new Set(stringArray(value))].join(", ") || "연결 없음"; }
function numbered(value: unknown) { return (Array.isArray(value) ? value : []).map((item, index) => `${index + 1}. ${mask(typeof item === "string" ? item : JSON.stringify(item))}`).join("\n"); }
function evidenceText(value: unknown) { return recordArray(value).map((e) => [text(e.documentName), text(e.location), mask(text(e.quote))].filter(Boolean).join(" / ")).join("\n") || "확인 필요"; }
function validateEvidence(evidence: JsonRecord, documents: JsonRecord[], code: string, issues: string[]) { const id = text(evidence.documentId); const document = documents.find((d) => String(d.id) === id); if (!id || !document || (evidence.documentName && evidence.documentName !== document.file_name)) issues.push(`${code}: 원문 근거 문서를 확인할 수 없습니다.`); }
function sourceLabel(value: string) { return ({ openai_actual: "OpenAI 실제 생성", fixture_sample: "fixture 샘플", user_direct: "사용자 직접 작성", user_edit: "사용자 수정", change_regeneration: "변경 반영 재생성" } as Record<string,string>)[value] || value; }
