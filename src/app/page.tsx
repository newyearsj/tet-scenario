"use client";

import { SVGProps, useState } from "react";
import Image from "next/image";
import { signIn, signOut, useSession } from "next-auth/react";
import DocumentAnalysis from "@/features/document-analysis/DocumentAnalysis";
import { CasesView, DashboardView, ExportView, HistoryView, ReviewCoverageView, ScenariosView } from "@/features/workspace/WorkspaceViews";
import ProjectSwitcher from "@/components/ProjectSwitcher";
import ProjectDashboard from "@/features/projects/ProjectDashboard";

type IconProps = SVGProps<SVGSVGElement>;

const Icon = ({ children, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
);

const icons = {
  grid: <Icon><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></Icon>,
  folder: <Icon><path d="M3 7.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></Icon>,
  alert: <Icon><path d="M12 3 2.7 19h18.6z"/><path d="M12 9v4"/><path d="M12 17h.01"/></Icon>,
  flow: <Icon><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h4a3 3 0 0 1 3 3v6"/><path d="m12 12 3 3 3-3"/></Icon>,
  check: <Icon><path d="M9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Icon>,
  chart: <Icon><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></Icon>,
  history: <Icon><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></Icon>,
  download: <Icon><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></Icon>,
  upload: <Icon><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 14v5h14v-5"/></Icon>,
  file: <Icon><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/></Icon>,
  arrow: <Icon><path d="M5 12h14"/><path d="m15 8 4 4-4 4"/></Icon>,
  trash: <Icon><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></Icon>,
  spark: <Icon><path d="m12 3 .9 3.1A7 7 0 0 0 18 11l3 1-3 1a7 7 0 0 0-5.1 4.9L12 21l-.9-3.1A7 7 0 0 0 6 13l-3-1 3-1a7 7 0 0 0 5.1-4.9z"/></Icon>,
};

const projectNavItems = [
  ["대시보드", "grid", "dashboard"], ["문서·분석", "folder", "documents"], ["테스트 시나리오", "flow", "scenarios"],
  ["테스트 케이스", "check", "cases"], ["검토·커버리지", "chart", "review"],
  ["내보내기", "download", "export"], ["변경이력", "history", "history"],
] as const;
type AppView = "projects" | (typeof projectNavItems)[number][2];

export default function Home() {
  const { data: session, status } = useSession();
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("projects");
  const [projectSelected, setProjectSelected] = useState(false);

  if (status === "loading") return <main className="auth-page"><div className="auth-card"><p>로그인 상태를 확인하고 있습니다.</p></div></main>;
  if (status !== "authenticated" || !session?.serverSessionValid) return <main className="auth-page"><div className="auth-card"><Image src="/testagent-logo.png" alt="TestScenarioAgent" width={320} height={107} priority/><h1>테스트 설계 작업공간</h1><p>등록된 Google 마스터 계정으로 로그인해 주세요.</p><button className="button primary" onClick={() => void signIn("google", { redirectTo: "/" })}>Google로 로그인</button><small>허용되지 않은 계정은 데이터와 세션을 만들 수 없습니다.</small></div></main>;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <Image className="brand-logo" src="/testagent-logo.png" alt="TestAgent 테스트 시나리오 기획·점검" width={2048} height={682} priority />
        </div>
        <nav aria-label="주요 메뉴">
          <button className={activeView === "projects" ? "nav-item active" : "nav-item"} onClick={() => { setActiveView("projects"); setMenuOpen(false); }}><span className="nav-icon">{icons.folder}</span><span>프로젝트</span></button>
          {projectSelected && projectNavItems.map(([label, icon, view]) => (
            <button key={label} className={activeView === view ? "nav-item active" : "nav-item"} onClick={() => { setActiveView(view); setMenuOpen(false); }}>
              <span className="nav-icon">{icons[icon]}</span><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note"><span>{icons.spark}</span><p>자료에 없는 정책은<br/><strong>‘확인 필요’</strong>로 구분합니다.</p></div>
      </aside>

      <div className="page">
        <header className="topbar">
          <button className="menu-button" aria-label="메뉴 열기" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><span/><span/><span/></button>
          <div className="mobile-brand"><Image src="/testagent-logo.png" alt="TestAgent" width={2048} height={682} priority /></div>
          <div className="top-status">{projectSelected&&<ProjectSwitcher onChangeProject={()=>setActiveView("projects")}/>}<span className="status-dot"/>{session.user.email}<button className="logout-button" onClick={() => { window.localStorage.removeItem("testagent-project-id"); void signOut({ redirectTo: "/" }); }}>로그아웃</button></div>
        </header>

        <main className={activeView === "documents" ? "workspace-main" : ""}>
          {activeView === "projects" ? <ProjectDashboard onSelect={()=>{setProjectSelected(true);setActiveView("dashboard");}}/> :
          activeView === "documents" ? <DocumentAnalysis onViewScenarios={()=>setActiveView("scenarios")} /> :
          activeView === "scenarios" ? <ScenariosView /> :
          activeView === "cases" ? <CasesView /> :
          activeView === "review" ? <ReviewCoverageView /> :
          activeView === "export" ? <ExportView /> :
          activeView === "history" ? <HistoryView /> : <DashboardView navigate={(view) => setActiveView(view as AppView)} />}
        </main>
      </div>

      {menuOpen && <button className="backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)}/>} 
      {notice && <div className="toast" role="status"><span>{icons.alert}</span><p>{notice}</p><button aria-label="안내 닫기" onClick={() => setNotice("")}>×</button></div>}
    </div>
  );
}
