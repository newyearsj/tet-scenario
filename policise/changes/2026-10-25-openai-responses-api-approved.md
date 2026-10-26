# OpenAI Responses API 변경 분석 연결

| 항목 | 내용 |
| --- | --- |
| 상태 | 승인 |
| 승인 일자 | 2026-10-25 |
| 제공자 | OpenAI |
| 서버 SDK | 공식 OpenAI JavaScript SDK |
| API | Responses API |
| 실습 기본 모델 | `gpt-6-luna` |
| 설정 | `OPENAI_API_KEY`, `OPENAI_MODEL` |

## 승인 내용

- 문서 변경 분석은 서버에서만 OpenAI API를 호출한다.
- 모델은 `OPENAI_MODEL`에서 읽고 값이 없을 때 실습 기본값 `gpt-6-luna`를 사용한다.
- 추가·수정·삭제 제안, 문서 근거, 관련 요구사항 코드를 Structured Outputs로 검증한다.
- 삭제는 명시적인 폐기·취소 근거가 있을 때만 허용한다.
- 응답 검증 실패, API 오류 또는 요청 취소 시 변경셋을 저장하지 않는다.
- API 키는 브라우저, 화면, 로그, 오류 응답에 노출하지 않는다.
- 실제 분석 결과와 fixture 기반 샘플 결과를 구분한다.
- 기존의 다른 AI 제공자 설정은 사용하지 않는다.
- 서버 전용 AI 클라이언트는 향후 IA·화면설계·테스트 생성에서도 재사용한다.
