import { sampleAnalysisResult } from "./fixtures/sample-analysis";
import { ScenarioGenerationResult } from "./types";

export const SAMPLE_ANALYSIS_STAGES = ["파일 읽는 중", "요구사항·화면 분석 중", "시나리오 생성 중"] as const;

const wait = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(resolve, milliseconds);
  signal?.addEventListener("abort", () => {
    clearTimeout(timeout);
    reject(new DOMException("요청이 취소되었습니다.", "AbortError"));
  }, { once: true });
});

// 6단계에서 실제 AI/API 구현으로 교체할 경계다. UI는 이 함수의 결과 형식에만 의존한다.
export async function analyzeDocumentSample(
  _files: File[],
  onStage: (stage: string) => void,
  signal?: AbortSignal,
): Promise<ScenarioGenerationResult> {
  for (const stage of SAMPLE_ANALYSIS_STAGES) {
    onStage(stage);
    await wait(650, signal);
  }
  return structuredClone(sampleAnalysisResult);
}
