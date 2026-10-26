# Supabase PostgreSQL 저장 구조 변경

| 항목 | 내용 |
| --- | --- |
| 상태 | 승인 |
| 승인 일자 | 2026-10-25 |
| 승인된 기술 | Supabase PostgreSQL |
| 런타임 연결 | `DATABASE_URL` / Transaction pooler |
| 마이그레이션 연결 | `DIRECT_URL` / Session pooler |

## 승인 내용

- Supabase Auth는 사용하지 않는다.
- 현재 인증은 미구현 상태로 유지하고 향후 Auth.js 기반 Google 로그인과 연결한다.
- 서버리스 환경에서 DB 연결 수를 작게 유지한다.
- Transaction pooler 연결은 prepared statements를 비활성화한다.
- 모든 PostgreSQL 연결에 SSL을 적용한다.
- 요구사항 반영은 변경 전 버전, 추적 관계, 변경이력, 변경셋 상태를 포함한 단일 트랜잭션으로 처리한다.
- 마이그레이션은 기존 데이터와 테이블을 삭제하거나 초기화하지 않는다.
- 기존 SQLite 파일이 있을 경우 자동 삭제·변환하지 않고 별도 이전 절차를 따른다.
