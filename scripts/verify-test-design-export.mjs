import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { buildTestDesignWorkbook, EXPORT_SHEETS } from "../src/lib/exports/test-design-export.ts";

const now = new Date("2026-10-26T10:00:00+09:00");
const evidence = [{ documentId: "doc-1", documentName: "한글 기획서.md", location: "1.1", quote: "사용자는 항목을 저장한다." }];
const data = {
  project: { id: "project-1", name: "한글 프로젝트", target_service_description: "범용 서비스" },
  documents: [{ id: "doc-1", file_name: "한글 기획서.md", document_version: 1, analyzed_character_count: 120, unanalyzed_character_count: 0, parse_status: "parsed", source_map: [] }],
  requirements: [{ id: "req-1", code: "REQ-001", title: "저장", description: "항목을 저장한다.", status: "active", source_document_name: "한글 기획서.md", is_sample: false }],
  scenarios: [{ id: "scenario-1", code: "TS-001", title: "저장 흐름", user_role: "사용자", user_goal: "항목 저장", related_requirement_codes: ["REQ-001"], related_screen_ids: ["SCR-001"], start_condition: "입력 화면 진입", main_flow: ["값 입력", "저장 선택"], branches: [], end_condition: "저장 완료", priority: "높음", rationale: "핵심 흐름", evidence, review_status: "draft", is_sample: false }],
  allTestCases: [{ id: "case-1", code: "TC-001", version: 1, scenario_code: "TS-001", title: "=2+2", objective: "저장을 검증", test_level: "기능", perspective: "정상", priority: "P1", priority_reason: "핵심", related_requirement_codes: ["REQ-001"], related_screen_ids: ["SCR-001"], preconditions: ["입력 화면 진입"], test_data: ["이름: =2+2", "이메일: person@example.com"], steps: [{ number: 1, action: "값 입력", expectedResult: "값 표시" }, { number: 2, action: "저장 선택", expectedResult: "저장 완료" }], evidence, question_codes: [], review_status: "draft", execution_status: "not_run", created_at: now, updated_at: now }],
  testCases: [], questions: [], changeImpacts: [], options: { reviewStatuses: ["draft"], includeSamples: false, approvedOnly: false },
};
data.testCases = data.allTestCases;

const { buffer, fileName } = await buildTestDesignWorkbook(data);
const workbook = XLSX.read(buffer, { type: "buffer", cellStyles: true });
assert.deepEqual(workbook.SheetNames, [...EXPORT_SHEETS]);
for (const name of EXPORT_SHEETS) {
  const sheet = workbook.Sheets[name];
  assert.ok(sheet["!ref"], `${name} 범위`);
  assert.ok(sheet["!autofilter"], `${name} 자동 필터`);
  assert.ok(sheet["!cols"]?.length, `${name} 열 너비`);
}
assert.equal(workbook.Workbook?.Sheets?.[0]?.Hidden || 0, 0);
const nativeWorkbook = new ExcelJS.Workbook();
await nativeWorkbook.xlsx.load(buffer);
for (const sheet of nativeWorkbook.worksheets) {
  assert.equal(sheet.views[0].state, "frozen", `${sheet.name} 첫 행 고정`);
  assert.equal(sheet.views[0].ySplit, 1, `${sheet.name} 첫 행 고정 위치`);
  assert.ok(sheet.autoFilter, `${sheet.name} 자동 필터 속성`);
  assert.ok(sheet.columns.every((column) => Number(column.width) >= 12), `${sheet.name} 열 너비 속성`);
  assert.equal(sheet.getCell("A1").font.bold, true, `${sheet.name} 머리글 서식`);
}
const caseRows = XLSX.utils.sheet_to_json(workbook.Sheets["테스트 케이스"]);
assert.equal(caseRows.length, 1);
assert.match(caseRows[0]["수행 단계"], /1\. 값 입력\n2\. 저장 선택/);
assert.equal(caseRows[0]["실행 상태"], "미실행");
assert.equal(caseRows[0].제목, "'=2+2");
assert.doesNotMatch(caseRows[0]["테스트 데이터"], /person@example\.com/);
assert.match(fileName, /^한글 프로젝트_테스트설계산출물_\d{8}_\d{4}\.xlsx$/);
await unlink(".tmp-export-test.xlsx").catch(() => undefined);
console.log(JSON.stringify({ sheets: workbook.SheetNames, fileName, caseRows: caseRows.length, verified: true }));
