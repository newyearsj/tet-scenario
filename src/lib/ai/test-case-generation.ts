import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAIClient, getOpenAIModel } from "./openai-client";

const StepSchema = z.object({ number: z.number().int().positive(), action: z.string().min(1), expectedResult: z.string().min(1) });
const TestCaseSchema = z.object({
  scenarioCode: z.string().min(1), code: z.string().min(1), title: z.string().min(1), objective: z.string().min(1),
  testLevel: z.enum(["기능", "통합", "인수"]), perspective: z.enum(["정상", "예외", "경계", "권한", "상태 전이", "비기능"]),
  priority: z.enum(["P1", "P2", "P3", "확인 필요"]), priorityReason: z.string().min(1),
  relatedRequirementCodes: z.array(z.string().min(1)), relatedScreenIds: z.array(z.string().min(1)),
  preconditions: z.array(z.string().min(1)), testData: z.array(z.string().min(1)), steps: z.array(StepSchema).min(1),
  evidence: z.array(z.object({ documentId: z.string(), documentName: z.string(), location: z.string(), quote: z.string() })).min(1),
  questionCodes: z.array(z.string()), reviewStatus: z.enum(["draft", "needs_review"]),
});
const OutputSchema = z.object({ testCases: z.array(TestCaseSchema) });
export type GeneratedTestCases = z.infer<typeof OutputSchema>;

export async function generateTestCases(input: { scenarios: unknown[]; signal?: AbortSignal }) {
  const response = await getOpenAIClient().responses.parse({
    model: getOpenAIModel(),
    input: [{ role: "system", content: "검토 전 테스트 시나리오를 상세 테스트 케이스 초안으로 변환한다. 문서 근거와 실제 참조 코드만 사용한다. 문서에 없는 수치·정책·오류 문구는 만들지 말고 확인 필요로 표시한다. 단계 번호는 1부터 연속되어야 하며 각 단계에는 관찰 가능한 기대 결과가 있어야 한다. 개인정보 대신 합성 데이터를 사용한다. 실행 상태나 통과·실패 결과를 만들지 않는다." }, { role: "user", content: JSON.stringify(input.scenarios) }],
    text: { format: zodTextFormat(OutputSchema, "test_case_generation") }, store: false,
  }, { signal: input.signal });
  if (!response.output_parsed) throw new Error("AI_RESPONSE_EMPTY");
  const result = OutputSchema.parse(response.output_parsed);
  const scenarioCodes = new Set((input.scenarios as { code: string }[]).map((item) => item.code));
  const sourceByScenario = new Map((input.scenarios as { code: string; requirements: string[]; screens: string[]; evidence: { documentId: string; documentName: string; quote: string }[] }[]).map((item) => [item.code, item]));
  const seen = new Set<string>();
  for (const item of result.testCases) {
    if (!scenarioCodes.has(item.scenarioCode) || seen.has(item.code)) throw new Error("AI_TEST_CASE_REFERENCE_INVALID");
    seen.add(item.code);
    const source = sourceByScenario.get(item.scenarioCode);
    if (!source || item.relatedRequirementCodes.some((code) => !source.requirements.includes(code)) || item.relatedScreenIds.some((code) => !source.screens.includes(code))) throw new Error("AI_TEST_CASE_TRACE_INVALID");
    if (item.evidence.some((evidence) => !source.evidence.some((candidate) => candidate.documentId === evidence.documentId && candidate.documentName === evidence.documentName && candidate.quote === evidence.quote))) throw new Error("AI_TEST_CASE_EVIDENCE_INVALID");
    item.steps.forEach((step, index) => { if (step.number !== index + 1) throw new Error("AI_TEST_CASE_STEPS_INVALID"); });
  }
  return result;
}
