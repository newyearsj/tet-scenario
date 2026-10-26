import assert from "node:assert/strict";
import { cleanList, cleanSteps, cleanText, redactForLog, validateSteps } from "../src/lib/test-case-validation.ts";

assert.equal(cleanText("  제목\u0000 "), "제목");
assert.deepEqual(cleanList([" REQ-001 ", "", null]), ["REQ-001"]);
const valid = cleanSteps([{ number: 1, action: "입력", expectedResult: "표시" }, { number: 2, action: "저장", expectedResult: "완료" }]);
assert.equal(validateSteps(valid), true);
assert.equal(validateSteps(cleanSteps([{ number: 2, action: "입력", expectedResult: "표시" }])), false);
assert.equal(validateSteps(cleanSteps([{ number: 1, action: "입력", expectedResult: "" }])), false);
const redacted = JSON.stringify(redactForLog({ email: "person@example.com", token: "secret", note: "password=abc" }));
assert.doesNotMatch(redacted, /person@example\.com|secret|password=abc/);
console.log(JSON.stringify({ steps: "연속 번호·기대 결과 검증", references: "정규화", secrets: "마스킹", verified: true }));
