# TestScenarioAgent

기획 문서를 분석해 근거가 연결된 테스트 시나리오와 테스트 케이스를 만들고, 검토 결과를 6개 시트 Excel로 내보내는 Next.js 애플리케이션입니다. 테스트를 실행하거나 통과 여부를 판정하는 도구는 아닙니다.

## 기술 구성

- Next.js 16 App Router, React 19, Node.js 24
- Auth.js 5 Google 로그인과 PostgreSQL 서버 세션
- Supabase PostgreSQL
- OpenAI 공식 SDK와 Responses API
- `xlsx` 문서 파싱, `exceljs` Excel 산출물 생성

SQLite나 로컬 파일 DB를 사용하지 않습니다. 업로드 문서의 원문과 업무 데이터는 PostgreSQL에 저장합니다. 생성한 Excel은 서버 메모리에서 검증·생성한 뒤 응답으로 전달하며 Vercel 파일 시스템에 저장하지 않습니다.

## 환경변수

다음 값은 모두 서버 전용이며 `NEXT_PUBLIC_` 접두사를 사용하지 않습니다.

| 이름 | 용도 | Vercel 권장 범위 |
|---|---|---|
| `DATABASE_URL` | Supabase Transaction pooler 런타임 연결 | Production, Preview |
| `DIRECT_URL` | Supabase Session pooler 마이그레이션 전용 | 배포 담당 환경만 |
| `OPENAI_API_KEY` | OpenAI API 인증 | Production, 필요한 Preview |
| `OPENAI_MODEL` | Responses API 모델 | Production, Preview |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID | Production, Preview 구성에 맞게 |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret | Production, Preview 구성에 맞게 |
| `AUTH_SECRET` | Auth.js 쿠키 암호화 비밀값 | Production, Preview별 분리 권장 |
| `MASTER_EMAIL` | 로그인 허용 Gmail 주소 | Production, Preview |

`.env.example`에는 변수명과 가짜 예시만 있습니다. `.env.local`의 실제 값, DB URL, API 키, 이메일과 쿠키 값은 커밋하거나 로그에 출력하지 않습니다. Vercel 환경변수 변경은 기존 배포에 자동 반영되지 않으므로 변경 후 재배포해야 합니다.

### AUTH_URL

현재 Auth.js 설정은 `trustHost: true`이고 Vercel 요청 호스트를 사용하므로 `AUTH_URL`을 필수로 설정하지 않습니다. 고정 프록시나 별도 운영 도메인 환경에서 호스트 자동 인식이 실패할 때만 `AUTH_URL=https://운영도메인`을 서버 환경변수로 추가합니다. Preview URL을 Production의 고정 `AUTH_URL`로 사용하지 않습니다.

## Google OAuth 콜백

- 로컬: `http://localhost:3000/api/auth/callback/google`
- 운영: `https://{운영도메인}/api/auth/callback/google`

운영 배포 전에 Google Cloud Console의 승인된 리디렉션 URI에 운영 주소를 추가합니다. Preview 로그인이 필요하면 사용할 Preview 도메인도 별도로 등록해야 합니다. Auth.js 표준 `/api/auth/callback/google` 경로는 변경하지 않습니다.

## 로컬 실행

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run dev
```

`npm.cmd run db:migrate`는 `.env.local`의 `DIRECT_URL`만 사용해 `migrations`의 미적용 SQL을 순서대로 실행합니다. 적용 이력은 `schema_migrations`에 저장됩니다. 애플리케이션 시작이나 Vercel Build Command에서 마이그레이션을 자동 실행하지 않습니다.

## 데이터와 파일 처리

- 런타임 DB 연결은 `DATABASE_URL`만 사용합니다.
- Supabase Transaction pooler 호환을 위해 prepared statement를 끄고 함수 인스턴스당 최대 연결을 1개로 제한합니다.
- 업로드 문서 원문은 PostgreSQL에 저장하고 파일 바이너리는 영구 저장하지 않습니다.
- 지원 형식은 TXT, MD, CSV, XLSX, XLS입니다.
- 문서당 분석 입력은 최대 80,000자이며 초과 원문과 미분석 문자 수는 DB에 보존합니다.
- 서비스의 파일 크기 정책은 아직 확정되지 않았습니다. Vercel의 요청 본문 제한과 실제 문서 크기를 배포 전 검증해야 하며, 근거 없이 제품 제한값을 추가하지 않습니다.
- Excel 산출물은 `exceljs`의 `writeBuffer()`로 메모리에서 만들고 브라우저에 `.xlsx` 응답으로 전달합니다.
- 대용량 프로젝트는 Excel 버퍼가 함수 메모리를 점유하므로 실제 운영 데이터로 메모리와 응답 크기를 확인해야 합니다.

## AI 처리와 Vercel 실행시간

OpenAI 및 PostgreSQL이 필요한 API는 Node.js runtime을 사용합니다. 문서 시나리오 생성, 변경 분석, 테스트 케이스 생성 경로는 코드에서 `maxDuration = 300`을 설정합니다.

- `/api/analysis/scenarios`
- `/api/analysis/change`
- `/api/analysis/test-cases`

300초 설정은 Fluid Compute가 활성화된 현재 Vercel Hobby 기본·최대 범위에 맞춘 값입니다. 사용하는 플랜과 Fluid Compute 설정의 허용치를 Vercel 대시보드에서 확인해야 합니다. 코드와 `vercel.json`에 실행 시간을 중복 설정하지 않으며 현재는 `vercel.json`을 사용하지 않습니다.

다중 테스트 케이스 생성은 브라우저가 최대 3개 시나리오씩 순차 요청합니다. 각 요청은 기존 `test_case_batches`와 `test_case_batch_results`에 전체 처리 상태와 시나리오별 성공·실패를 저장합니다. 실패한 시나리오 ID만 다시 선택할 수 있습니다. 요청이 끝난 뒤 실행이 계속된다고 가정하는 백그라운드 작업은 사용하지 않습니다.

시나리오 생성과 변경 분석은 OpenAI 응답 검증 및 DB 저장이 끝난 뒤 HTTP 응답을 반환합니다. 운영 데이터에서 300초를 반복해서 초과한다면 임의의 fire-and-forget 처리를 추가하지 말고 Vercel Workflow나 외부 큐의 비용과 운영 방식을 먼저 검토해야 합니다.

## Vercel 배포 설정

Vercel에서 저장소를 연결하고 Framework Preset은 Next.js 자동 인식을 사용합니다.

- Install Command: 기본값(`npm install`)
- Build Command: 기본값(`npm run build`)
- Output Directory: 기본 Next.js 출력 사용, 직접 지정하지 않음
- Node.js: `package.json`의 `24.x`(현재 Vercel 신규 프로젝트 기본 LTS)
- Fluid Compute: Functions 설정에서 활성 여부 확인
- 배포 리전: Supabase 리전과 네트워크 지연을 고려해 선택

별도의 `vercel.json`은 필요하지 않습니다. `.vercelignore`는 환경 파일, 원문 자료, DB 파일, 임시 산출물, 개발 문서와 마이그레이션 도구가 함수 번들에 포함되지 않도록 제한합니다.

### 배포 순서

1. Vercel 프로젝트를 Git 저장소에 연결합니다.
2. Production과 필요한 Preview 범위에 환경변수를 등록합니다.
3. Google Console에 운영 콜백 URI를 추가합니다.
4. 운영 DB에 대해 로컬 또는 승인된 관리 환경에서 `npm.cmd run db:migrate`를 실행합니다.
5. `npm.cmd run lint`, `npm.cmd run build`와 회귀 테스트를 실행합니다.
6. Vercel Production 배포를 실행합니다.
7. 로그인, 프로젝트 경계, AI 생성과 Excel 다운로드를 점검합니다.

## 배포 후 점검

### 로그인

1. 등록된 Google 마스터 계정으로 로그인합니다.
2. 다른 Google 계정이 일반 안내와 함께 거부되는지 확인합니다.
3. 로그아웃 후 기존 서버 세션으로 업무 API를 호출하면 `401`인지 확인합니다.
4. 운영 HTTPS에서 Secure·HttpOnly·SameSite=Lax 쿠키가 적용되는지 확인합니다.

### 프로젝트 소유권

1. 현재 사용자 소유 프로젝트만 목록에 표시되는지 확인합니다.
2. 존재하지 않는 프로젝트는 `404`인지 확인합니다.
3. 다른 소유자 또는 `owner_user_id IS NULL` 레거시 프로젝트는 `403`인지 확인합니다.
4. 문서·시나리오·케이스·변경셋 ID를 직접 바꿔도 프로젝트 경계를 우회하지 못하는지 확인합니다.

### 업무 기능

1. 문서 원문이 PostgreSQL에 저장되는지 확인합니다.
2. 시나리오와 테스트 케이스 생성 진행·부분 실패가 DB와 화면에서 일치하는지 확인합니다.
3. Excel이 6개 시트, 한글 파일명과 정상 줄바꿈으로 다운로드되는지 확인합니다.
4. Vercel Function 로그에 이메일, 토큰, 키, DB URL과 업로드 원문이 남지 않는지 확인합니다.

## 검증 명령

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test:export
npm.cmd run test:test-cases
```

## 롤백

- 애플리케이션: Vercel Deployments에서 직전 정상 배포를 Promote하거나 현재 배포를 롤백합니다.
- 환경변수: 이전 값을 복원한 뒤 반드시 재배포합니다.
- DB: 마이그레이션은 자동 롤백하지 않습니다. 기존 데이터 보존을 원칙으로 하며, 장애가 발생하면 변경 SQL과 영향을 확인한 뒤 승인된 보정 마이그레이션을 추가합니다.
- 레거시 데이터: `owner_user_id IS NULL` 프로젝트는 자동 이전하거나 삭제하지 않습니다.

## 배포 제외

`.gitignore`와 `.vercelignore`는 `.env*`, 로컬 DB, 임시 Excel·CSV, 업로드 폴더, 로그, `.next`, 테스트 캐시와 IDE 설정을 제외합니다. `.env.example`만 저장소에 남깁니다. 수업용 원문과 내부 정책 문서는 런타임 번들에 포함하지 않습니다.
