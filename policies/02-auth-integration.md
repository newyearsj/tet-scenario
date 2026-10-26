# Google 마스터 계정 인증 통합 정책

## 적용 범위

- PRD `FR-AUTH-01~06`, `NFR-15~16`
- 화면 `PA-AUTH-001`, 공통 인증·소유권 처리 `PA-COM-001`
- Auth.js Google Provider와 PostgreSQL 서버 세션을 사용한다.
- 설치 버전은 Next.js App Router 공식 안내의 `next-auth@beta`이며 현재 잠금 파일에 설치된 버전을 사용한다. Pages Router 방식은 사용하지 않는다.

## Auth.js 경로 대응

| PRD 기능 | 실제 경로 또는 처리 |
|---|---|
| 로그인 시작 | Auth.js `signIn("google")` → `/api/auth/signin/google` |
| Google 콜백 | `/api/auth/callback/google` |
| 세션 조회 | `/api/auth/session` |
| 로그아웃 | Auth.js `signOut()` → `/api/auth/signout`; 이벤트에서 PostgreSQL 세션 폐기 |
| 인증 오류 | `/auth/error` |
| 프로젝트 목록 | `/api/projects` |
| 업무 API 인증 | `src/proxy.ts`와 서버 권한 도우미 |
| Excel 다운로드 | 보호된 `/api/exports/test-design` |

Google Console에 등록된 개발 콜백 `http://localhost:3000/api/auth/callback/google`을 그대로 사용한다. 요청 범위는 `openid email profile`뿐이다.

## 마스터 계정·세션 정책

- `MASTER_EMAIL`은 서버에서만 읽으며 trim·소문자 처리 후 비교하고 `@gmail.com` 주소만 허용한다.
- 누락·형식 오류는 인증 설정 오류(5xx)로 처리하고, 로그인 계정 불일치와 구분한다.
- Google `email_verified=true`이며 정규화 이메일이 정확히 같을 때만 로그인한다. 거부 시 사용자·세션·프로젝트를 만들지 않는다.
- 최초 로그인에만 사용자를 만들고 이후에는 Google `sub`로 연결한다.
- Auth.js 암호화 쿠키에는 임의 토큰을 담고 DB에는 SHA-256 해시만 저장한다. 서버 세션은 7일 후 만료되고 로그아웃 시 폐기한다.
- 개발 HTTP는 `secure=false`, 운영 HTTPS는 `__Secure-` 이름과 `secure=true`를 사용한다. 쿠키는 `httpOnly`, `sameSite=lax`다.

## 프로젝트 소유권과 기존 데이터

- 세션이 없거나 폐기된 요청은 `401`, 유효한 세션으로 타인 또는 소유자 없는 프로젝트를 요청하면 `403`이다.
- 유효한 세션에서 존재하지 않는 프로젝트나 하위 데이터는 `404`다.
- 인증 전 생성되어 `owner_user_id IS NULL`인 프로젝트와 하위 데이터는 삭제하거나 자동 배정하지 않는다. DB에 보존하되 인증 후 목록과 업무 API에서는 제외한다.
- 최초 로그인 시 소유 프로젝트가 없으면 내용이 비어 있는 `새 프로젝트`를 만든다.
- 향후 이전은 자동 실행하지 않는다. (1) 레거시 프로젝트 명시 선택, (2) 하위 데이터 건수·참조 무결성 점검, (3) 사용자 확인, (4) 단일 트랜잭션으로 `owner_user_id` 할당, (5) 변경이력 기록, (6) 프로젝트·하위 데이터 접근 검증을 수행하며 실패 시 전체 롤백한다.

## 비밀값

`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `MASTER_EMAIL`은 서버 전용이다. 실제 값을 저장소, 화면, API 오류, 로그에 기록하지 않으며 `NEXT_PUBLIC_` 접두사를 사용하지 않는다.
