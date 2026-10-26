import Link from "next/link";

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="auth-page"><section className="auth-card"><h1>로그인할 수 없습니다</h1><p>{error === "AccessDenied" ? "허용된 Google 계정인지, 이메일 인증이 완료되었는지 확인해 주세요." : "인증이 취소되었거나 서버 인증 설정을 확인해야 합니다."}</p><p>보안을 위해 허용 이메일과 서버 설정값은 표시하지 않습니다.</p><Link className="button primary" href="/">로그인 화면으로 돌아가기</Link></section></main>;
}
