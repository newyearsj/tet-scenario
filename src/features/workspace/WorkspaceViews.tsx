"use client";

import { useCallback, useEffect, useState } from "react";
import { loadScenarios } from "@/features/document-analysis/api";
import type { TestScenario } from "@/features/document-analysis/types";

type Counts = { document_count: number; requirement_count: number; question_count: number; scenario_count: number; test_case_count: number; uncovered_count: number; draft_test_case_count: number; needs_review_test_case_count: number; reviewed_test_case_count: number; user_edited_test_case_count: number };
type Question = { id: string; code: string; question_type: string; question: string; related_requirement_codes: string[]; related_screen_ids: string[]; evidence: { documentName?: string; location?: string; quote?: string }[]; status: string; answer?: string };
type TestCase = { id: string; code: string; version: number; title: string; objective: string; test_level: string; perspective: string; priority: string; priority_reason: string; user_role?: string; related_requirement_codes: string[]; related_screen_ids: string[]; preconditions: string[]; test_data: string[]; steps: { number: number; action: string; expectedResult: string }[]; evidence: { documentName?: string; location?: string; quote?: string }[]; question_codes: string[]; review_status: string; execution_status: string; creation_source: string; last_modified_source: string; scenario_code?: string };
type Requirement = { id: string; code: string; title: string; description: string; status: string; scenario_codes: string[]; test_case_codes: string[]; covered: boolean };
type Activity = { id: string; target_type: string; target_code?: string; target_version?: number; action: string; change_source?: string; actor_label?: string; reason?: string; before_data?: Record<string, unknown>; after_data?: Record<string, unknown>; created_at: string };
type ScenarioSummary = { id: string; code: string; title: string; review_status: string };
type WorkspaceData = { counts: Counts; questions: Question[]; scenarios: ScenarioSummary[]; testCases: TestCase[]; requirements: Requirement[]; activities: Activity[] };

const labels: Record<string, string> = { policy_missing: "정책 누락", document_conflict: "문서 충돌", condition_missing: "조건 누락", reference_error: "참조 오류", open: "미답변", answered: "답변됨", decided: "결정됨", deferred: "보류", draft: "초안", needs_review: "확인 필요", reviewed: "검토 완료", approved: "승인", excluded: "제외", re_review: "재검토", not_run: "미실행" };

function useProjectData() {
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async (id?: string) => {
    const target = id || projectId;
    if (!target) return;
    try {
      const response = await fetch(`/api/workspace?projectId=${encodeURIComponent(target)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "데이터를 불러오지 못했습니다."); }
  }, [projectId]);
  useEffect(() => {
    const initialize = async () => {
      const key = "testagent-project-id";
      const response = await fetch("/api/projects");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const projects = Array.isArray(body.projects) ? body.projects : [];
      const stored = window.localStorage.getItem(key);
      const selected = projects.find((project: { id: string }) => project.id === stored) ?? projects[0];
      if (!selected) throw new Error("사용할 수 있는 프로젝트가 없습니다.");
      const id = selected.id;
      window.localStorage.setItem(key, id); setProjectId(id);
      await reload(id);
    };
    void initialize().catch((reason) => setError(reason instanceof Error ? reason.message : "프로젝트를 불러오지 못했습니다."));
  }, [reload]);
  return { projectId, data, error, reload };
}

export function DashboardView({ navigate }: { navigate: (view: string) => void }) {
  const { data, error } = useProjectData();
  if (error) return <ErrorPanel message={error}/>;
  if (!data) return <Loading/>;
  const c = data.counts;
  const denominator=data.requirements.filter(r=>r.status!=="deleted").length; const covered=data.requirements.filter(r=>r.status!=="deleted"&&r.covered).length;
  const cards = [["등록 문서", c.document_count, "documents"], ["테스트 시나리오", c.scenario_count, "scenarios"], ["테스트 케이스", c.test_case_count, "cases"], ["검토 필요", c.question_count, "review"]] as const;
  const next = c.document_count === 0 ? ["문서를 업로드해 테스트 설계를 시작하세요.", "documents", "문서 업로드"] : c.scenario_count === 0 ? ["업로드한 문서에서 테스트 시나리오를 생성해 주세요.", "documents", "시나리오 생성"] : c.test_case_count === 0 ? ["시나리오를 기준으로 테스트 케이스를 생성해 주세요.", "cases", "케이스 생성"] : c.question_count > 0 ? ["결정이 필요한 항목을 검토해 주세요.", "review", "검토하기"] : c.uncovered_count > 0 ? ["테스트가 연결되지 않은 요구사항을 확인해 주세요.", "review", "커버리지 확인"] : ["현재 테스트 설계 산출물을 검토할 수 있습니다.", "export", "산출물 보기"];
  return <Workspace title="프로젝트 대시보드" description="선택한 프로젝트의 핵심 현황입니다."><div className="dashboard-actions"><button className="button primary" onClick={()=>navigate("documents")}>문서 업로드</button><button className="button secondary" onClick={()=>navigate("projects")}>프로젝트 변경</button></div><div className="summary-grid workspace-summary compact-summary">{cards.map(([label,count,view])=><button className="summary-card summary-button" key={label} onClick={()=>navigate(view)}><div><p>{label}</p><strong>{count}건</strong></div></button>)}{denominator>0&&<button className="summary-card summary-button" onClick={()=>navigate("review")}><div><p>설계 커버리지</p><strong>{covered}/{denominator}</strong></div></button>}</div><section className="panel next-panel"><span className="section-kicker">NEXT</span><h2>다음 작업</h2><p>{next[0]}</p><button className="button primary" onClick={()=>navigate(next[1])}>{next[2]}</button></section></Workspace>;
}

export function QuestionsView() {
  const { data, error, reload } = useProjectData();
  const [saving, setSaving] = useState("");
  if (error) return <ErrorPanel message={error}/>;
  if (!data) return <Loading/>;
  const decide = async (question: Question, form: HTMLFormElement) => {
    const values = new FormData(form); setSaving(question.id);
    await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: question.id, status: "decided", answer: values.get("answer"), decisionReason: values.get("reason") }) });
    setSaving(""); await reload();
  };
  return <Workspace title="확인 필요 사항" description="누락·충돌·미확정 정책을 검토하고 사용자 결정을 기록합니다."><div className="summary-grid workspace-summary"><article className="summary-card"><div><p>미결 항목</p><strong>{data.questions.filter((q) => q.status === "open" || q.status === "answered").length}건</strong></div></article><article className="summary-card"><div><p>결정 완료</p><strong>{data.questions.filter((q) => q.status === "decided").length}건</strong></div></article></div>{data.questions.length ? <div className="proposal-list">{data.questions.map((q) => <article className="review-card" key={q.id}><div className="proposal-title"><span className="needs-check">{labels[q.question_type]}</span><strong>{q.code} · {q.question}</strong><span className="badge">{labels[q.status]}</span></div><p>요구사항: {q.related_requirement_codes.join(", ") || "연결 없음"} · 화면: {q.related_screen_ids.join(", ") || "연결 없음"}</p>{q.evidence.map((e, i) => <blockquote key={i}>{e.documentName} · {e.location}<br/>{e.quote}</blockquote>)}{q.status !== "decided" && <form className="decision-form" onSubmit={(event) => { event.preventDefault(); void decide(q, event.currentTarget); }}><label>답변<textarea name="answer" required/></label><label>결정 사유<textarea name="reason" required/></label><button className="button primary" disabled={saving === q.id}>{saving === q.id ? "저장 중" : "결정 저장"}</button></form>}</article>)}</div> : <Empty text="문서 분석 후 확인이 필요한 항목이 표시됩니다."/>}</Workspace>;
}

export function ScenariosView() {
  const [items, setItems] = useState<TestScenario[] | null>(null);
  useEffect(() => {
    const initialize = async () => {
      const id = window.localStorage.getItem("testagent-project-id");
      if (!id) { setItems([]); return; }
      try { setItems(await loadScenarios(id)); } catch { setItems([]); }
    };
    void initialize();
  }, []);
  return <Workspace title="테스트 시나리오" description="문서 근거와 요구사항·화면 연결을 포함한 검토 전 초안입니다.">{items === null ? <Loading/> : items.length ? <div className="proposal-list">{items.map((s) => <article className="review-card" key={s.id}><div className="proposal-title"><span className={s.reviewStatus === "needs_review" ? "needs-check" : "actual-pill"}>{labels[s.reviewStatus]}</span><strong>{s.code} · {s.title}</strong></div><p>{s.userRole} · {s.userGoal}</p><dl className="proposal-meta"><div><dt>요구사항</dt><dd>{s.relatedRequirementCodes.join(", ") || "연결 없음"}</dd></div><div><dt>화면</dt><dd>{s.relatedScreenIds.join(", ") || "연결 없음"}</dd></div><div><dt>시작</dt><dd>{s.startCondition}</dd></div><div><dt>흐름</dt><dd><ol>{s.mainFlow.map((step, i) => <li key={i}>{step}</li>)}</ol></dd></div><div><dt>종료</dt><dd>{s.endCondition}</dd></div></dl></article>)}</div> : <Empty text="문서 분석에서 테스트 시나리오를 생성해 주세요."/>}</Workspace>;
}

export function CasesView() {
  const { projectId, data, error, reload } = useProjectData(); const [selected, setSelected] = useState<string[]>([]); const [generating, setGenerating] = useState(false); const [message, setMessage] = useState("");
  const [failed, setFailed] = useState<string[]>([]); const [filters, setFilters] = useState({ query: "", level: "", perspective: "", status: "", source: "" }); const [detailId, setDetailId] = useState(""); const [detail, setDetail] = useState<TestCase | null>(null); const [versions, setVersions] = useState<{ version: number; modification_reason: string; modified_source: string; replaced_at: string }[]>([]); const [saving, setSaving] = useState(false);
  if (error) return <ErrorPanel message={error}/>; if (!data) return <Loading/>;
  const generate = async () => {
    if (!window.confirm(`선택한 ${selected.length}개 시나리오에서 테스트 케이스 초안을 생성합니다. 기존 승인본은 변경하지 않습니다.`)) return;
    const targets=[...selected], batchSize=3, failedIds:string[]=[]; let completed=0, generatedCount=0;
    setGenerating(true); setFailed([]);
    try {
      for(let offset=0;offset<targets.length;offset+=batchSize){
        const scenarioIds=targets.slice(offset,offset+batchSize);
        setMessage(`총 ${targets.length}개 중 ${completed}개 완료 · ${scenarioIds.length}개 처리 중`);
        const response=await fetch("/api/analysis/test-cases",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,scenarioIds,requestKey:crypto.randomUUID()})});
        const body=await response.json();
        if(!response.ok&&!body.results){failedIds.push(...scenarioIds);continue;}
        failedIds.push(...(body.results||[]).filter((item:{status:string})=>item.status==="failed").map((item:{scenarioId:string})=>item.scenarioId));
        completed+=Number(body.completed||0); generatedCount+=Number(body.count||0);
      }
      setFailed(failedIds); setSelected(failedIds); setMessage(`완료 ${completed}개, 실패 ${failedIds.length}개, 생성 ${generatedCount}건`); await reload();
    } catch(reason){setMessage(reason instanceof Error?reason.message:"생성에 실패했습니다.");}
    finally{setGenerating(false);}
  };
  const openDetail = async (id: string) => { setDetailId(id); const response = await fetch(`/api/test-cases/${id}`); const body = await response.json(); if (response.ok) { setDetail(body.testCase); setVersions(body.versions); } else setMessage(body.error); };
  const save = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!detail) return; const form = new FormData(event.currentTarget); setSaving(true); const payload = { title: form.get("title"), objective: form.get("objective"), userRole: form.get("userRole"), testLevel: form.get("testLevel"), perspective: form.get("perspective"), priority: form.get("priority"), priorityReason: form.get("priorityReason"), relatedRequirementCodes: splitLines(form.get("requirements")), relatedScreenIds: splitLines(form.get("screens")), preconditions: splitLines(form.get("preconditions")), testData: splitLines(form.get("testData")), questionCodes: splitLines(form.get("questions")), steps: detail.steps, reviewStatus: form.get("reviewStatus"), modificationReason: form.get("reason") }; const response = await fetch(`/api/test-cases/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json(); setSaving(false); if (!response.ok) { setMessage(body.error); return; } setMessage(`${detail.code} v${body.testCase.version}으로 저장했습니다.`); await reload(); await openDetail(detail.id); };
  const visible = data.testCases.filter((tc) => (!filters.query || [tc.code,tc.title,tc.objective,tc.scenario_code,...tc.related_requirement_codes,...tc.related_screen_ids].join(" ").toLowerCase().includes(filters.query.toLowerCase())) && (!filters.level || tc.test_level === filters.level) && (!filters.perspective || tc.perspective === filters.perspective) && (!filters.status || tc.review_status === filters.status) && (!filters.source || tc.creation_source === filters.source));
  const allScenarioIds = data.scenarios.map((scenario) => scenario.id); const allSelected = allScenarioIds.length > 0 && allScenarioIds.every((id) => selected.includes(id));
  return <Workspace title="테스트 케이스" description="AI 생성 출처와 사용자 수정 이력을 구분해 상세 테스트 케이스를 관리합니다."><section className="review-card"><div className="review-heading"><div><h2>생성할 시나리오 선택</h2><p>시나리오별 성공·실패를 기록하며 결과는 미실행 초안으로 저장합니다.</p></div></div>{data.scenarios.length ? <div className="case-selector"><label className="case-select-all"><input type="checkbox" checked={allSelected} disabled={generating} onChange={() => setSelected(allSelected ? [] : allScenarioIds)}/><span><strong>전체 선택</strong> · {data.scenarios.length}개 시나리오</span></label>{data.scenarios.map((s) => <label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} disabled={generating} onChange={() => setSelected((current) => current.includes(s.id) ? current.filter((id) => id !== s.id) : [...current, s.id])}/><span><strong>{s.code}</strong> · {s.title}{failed.includes(s.id) && <small> · 이전 생성 실패</small>}</span></label>)}</div> : <p>먼저 테스트 시나리오를 생성해 주세요.</p>}<button className="button primary" disabled={!selected.length || generating} onClick={() => void generate()}>{generating ? `총 ${selected.length}개 시나리오 생성 중` : failed.length ? `실패한 ${selected.length}개 다시 생성` : `선택한 ${selected.length}개 시나리오로 생성`}</button>{message && <div className="inline-message" aria-live="polite"><p>{message}</p></div>}</section>
  <div className="case-filters"><input placeholder="코드·제목·요구사항·화면 검색" value={filters.query} onChange={(e) => setFilters({...filters,query:e.target.value})}/><select value={filters.level} onChange={(e) => setFilters({...filters,level:e.target.value})}><option value="">전체 수준</option>{["기능","통합","인수"].map(v=><option key={v}>{v}</option>)}</select><select value={filters.perspective} onChange={(e) => setFilters({...filters,perspective:e.target.value})}><option value="">전체 관점</option>{["정상","예외","경계","권한","상태 전이","비기능"].map(v=><option key={v}>{v}</option>)}</select><select value={filters.status} onChange={(e) => setFilters({...filters,status:e.target.value})}><option value="">전체 상태</option>{Object.entries(labels).filter(([k])=>["draft","needs_review","reviewed","approved","excluded","re_review"].includes(k)).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select><select value={filters.source} onChange={(e) => setFilters({...filters,source:e.target.value})}><option value="">전체 생성 출처</option><option value="openai_actual">OpenAI 실제 생성</option><option value="fixture_sample">fixture 샘플</option><option value="user_direct">사용자 직접 작성</option><option value="change_regeneration">변경 반영 재생성</option></select></div>
  {visible.length ? <div className="requirement-table-wrap"><table className="requirement-table"><thead><tr><th>코드</th><th>제목·목적</th><th>수준·관점</th><th>연결</th><th>출처</th><th>상태</th></tr></thead><tbody>{visible.map((tc) => <tr key={tc.id} className="clickable-row" onClick={() => void openDetail(tc.id)}><td><strong>{tc.code}</strong><small>v{tc.version}</small></td><td>{tc.title}<small>{tc.objective}</small></td><td>{tc.test_level} · {tc.perspective}</td><td>{tc.scenario_code || "시나리오 없음"}<br/>{tc.related_requirement_codes.join(", ")}</td><td>{sourceLabel(tc.creation_source)}{tc.last_modified_source === "user_edit" && <small>사용자 수정됨</small>}</td><td>{labels[tc.review_status]} · {labels[tc.execution_status]}</td></tr>)}</tbody></table></div> : <Empty text="조건에 맞는 테스트 케이스가 없습니다."/>}
  {detailId && detail && <div className="detail-overlay" role="dialog" aria-modal="true" aria-label="테스트 케이스 상세"><form className="detail-panel" onSubmit={(e)=>void save(e)}><div className="detail-head"><div><strong>{detail.code} · v{detail.version}</strong><p>{sourceLabel(detail.creation_source)} / 마지막 수정 {sourceLabel(detail.last_modified_source)}</p></div><button type="button" onClick={()=>{setDetailId("");setDetail(null);}}>×</button></div><div className="detail-grid"><label>제목<input name="title" defaultValue={detail.title} required/></label><label>검증 목적<textarea name="objective" defaultValue={detail.objective} required/></label><label>사용자 역할<input name="userRole" defaultValue={detail.user_role || ""}/></label><label>테스트 수준<select name="testLevel" defaultValue={detail.test_level}>{["기능","통합","인수"].map(v=><option key={v}>{v}</option>)}</select></label><label>검증 관점<select name="perspective" defaultValue={detail.perspective}>{["정상","예외","경계","권한","상태 전이","비기능"].map(v=><option key={v}>{v}</option>)}</select></label><label>우선순위<input name="priority" defaultValue={detail.priority} required/></label><label>우선순위 사유<textarea name="priorityReason" defaultValue={detail.priority_reason} required/></label><label>요구사항 코드<textarea name="requirements" defaultValue={detail.related_requirement_codes.join("\n")}/></label><label>화면 ID<textarea name="screens" defaultValue={detail.related_screen_ids.join("\n")}/></label><label>사전조건<textarea name="preconditions" defaultValue={detail.preconditions.join("\n")} required/></label><label>테스트 데이터<textarea name="testData" defaultValue={detail.test_data.join("\n")} required/></label><label>확인 질문 코드<textarea name="questions" defaultValue={detail.question_codes.join("\n")}/></label><label>검토 상태<select name="reviewStatus" defaultValue={detail.review_status}>{["draft","needs_review","reviewed","approved","excluded","re_review"].map(v=><option value={v} key={v}>{labels[v]}</option>)}</select></label></div><section className="steps-editor"><h3>수행 단계와 기대 결과</h3>{detail.steps.map((step,index)=><div key={index}><span>{step.number}</span><textarea value={step.action} onChange={e=>setDetail({...detail,steps:detail.steps.map((s,i)=>i===index?{...s,action:e.target.value}:s)})}/><textarea value={step.expectedResult} onChange={e=>setDetail({...detail,steps:detail.steps.map((s,i)=>i===index?{...s,expectedResult:e.target.value}:s)})}/></div>)}</section><label className="reason-field">수정 사유<textarea name="reason" required/></label><details><summary>원문 근거와 이전 버전</summary>{detail.evidence.map((e,i)=><blockquote key={i}>{e.documentName} · {e.location}<br/>{e.quote}</blockquote>)}<ul>{versions.map(v=><li key={v.version}>v{v.version} · {sourceLabel(v.modified_source)} · {v.modification_reason} · {new Date(v.replaced_at).toLocaleString("ko-KR")}</li>)}</ul></details><div className="detail-actions"><button type="button" className="button secondary" onClick={()=>setDetailId("")}>취소</button><button className="button primary" disabled={saving}>{saving?"저장 중":"새 버전으로 저장"}</button></div></form></div>}</Workspace>;
}

export function CoverageView() { const { data, error } = useProjectData(); if (error) return <ErrorPanel message={error}/>; if (!data) return <Loading/>; const denominator = data.requirements.filter((r) => r.status !== "deleted").length; const numerator = data.requirements.filter((r) => r.covered).length; return <Workspace title="요구사항 커버리지" description="실제 저장된 추적 연결만 집계하며 테스트 실행 결과를 의미하지 않습니다."><div className="actual-result-notice"><strong>설계 커버리지</strong><p>{denominator ? `${numerator}/${denominator} · ${Math.round(numerator / denominator * 100)}%` : "산정 불가 · 범위 내 활성 요구사항이 없습니다."}</p></div>{data.requirements.length ? <div className="requirement-table-wrap"><table className="requirement-table"><thead><tr><th>요구사항</th><th>설명</th><th>시나리오</th><th>케이스</th><th>상태</th></tr></thead><tbody>{data.requirements.map((r) => <tr key={r.id}><td><strong>{r.code}</strong><small>{r.title}</small></td><td>{r.description}</td><td>{r.scenario_codes.join(", ") || "없음"}</td><td>{r.test_case_codes.join(", ") || "없음"}</td><td>{r.covered ? "검토 완료 연결" : r.test_case_codes.length ? "초안 연결" : "미커버"}</td></tr>)}</tbody></table></div> : <Empty text="분석된 요구사항이 없어 커버리지를 산정할 수 없습니다."/>}</Workspace>; }

export function ReviewCoverageView() {
  const { data,error,reload }=useProjectData(); const [saving,setSaving]=useState("");
  if(error)return <ErrorPanel message={error}/>; if(!data)return <Loading/>;
  const openQuestions=data.questions.filter(q=>q.status==="open"||q.status==="answered"); const activeRequirements=data.requirements.filter(r=>r.status!=="deleted"); const covered=activeRequirements.filter(r=>r.covered).length;
  const decide=async(question:Question,form:HTMLFormElement)=>{const values=new FormData(form);setSaving(question.id);try{await fetch("/api/workspace",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:question.id,status:"decided",answer:values.get("answer"),decisionReason:values.get("reason")})});await reload();}finally{setSaving("");}};
  return <Workspace title="검토·커버리지" description="결정이 필요한 항목과 요구사항 연결 상태를 한곳에서 확인합니다."><div className="review-overview"><article><span>검토 필요</span><strong>{openQuestions.length}건</strong></article><article><span>설계 커버리지</span><strong>{activeRequirements.length?`${covered}/${activeRequirements.length}`:"산정 불가"}</strong></article><article><span>미커버 요구사항</span><strong>{data.counts.uncovered_count}건</strong></article></div>
  <section className="review-section"><div className="section-title"><div><h2>검토가 필요한 항목</h2><p>문서에서 확정할 수 없는 내용만 표시합니다.</p></div></div>{openQuestions.length?<div className="proposal-list">{openQuestions.map(q=><article className="review-card" key={q.id}><div className="proposal-title"><span className="needs-check">{labels[q.question_type]}</span><strong>{q.code} · {q.question}</strong></div><p>요구사항: {q.related_requirement_codes.join(", ")||"연결 없음"} · 화면: {q.related_screen_ids.join(", ")||"연결 없음"}</p>{q.status!=="decided"&&<form className="decision-form" onSubmit={event=>{event.preventDefault();void decide(q,event.currentTarget);}}><label>답변<textarea name="answer" required/></label><label>결정 사유<textarea name="reason" required/></label><button className="button primary" disabled={saving===q.id}>{saving===q.id?"저장 중":"결정 저장"}</button></form>}</article>)}</div>:<Empty text="현재 검토가 필요한 항목이 없습니다."/>}</section>
  <section className="review-section"><div className="section-title"><div><h2>요구사항 커버리지</h2><p>테스트 실행 결과가 아니라 검토된 테스트 설계 연결 상태입니다.</p></div></div>{activeRequirements.length?<div className="requirement-table-wrap"><table className="requirement-table"><thead><tr><th>요구사항</th><th>설명</th><th>시나리오</th><th>케이스</th><th>상태</th></tr></thead><tbody>{activeRequirements.map(r=><tr key={r.id}><td><strong>{r.code}</strong><small>{r.title}</small></td><td>{r.description}</td><td>{r.scenario_codes.join(", ")||"없음"}</td><td>{r.test_case_codes.join(", ")||"없음"}</td><td>{r.covered?"검토 완료 연결":r.test_case_codes.length?"초안 연결":"미커버"}</td></tr>)}</tbody></table></div>:<Empty text="분석된 요구사항이 없어 커버리지를 산정할 수 없습니다."/>}</section></Workspace>;
}

type ExportSummary = { projectName: string; requirementCount: number; scenarioCount: number; totalTestCaseCount: number; includedTestCaseCount: number; openQuestionCount: number; changeImpactCount: number; uncoveredCount: number; statusCounts: Record<string, number> };
const exportStatuses = [["draft", "초안"], ["needs_review", "확인 필요"], ["reviewed", "검토 완료"], ["approved", "승인"], ["excluded", "제외"], ["re_review", "재검토 필요"]] as const;

export function ExportView() {
  const { projectId } = useProjectData();
  const [summary, setSummary] = useState<ExportSummary | null>(null); const [mode, setMode] = useState<"all" | "approved">("all");
  const [statuses, setStatuses] = useState(exportStatuses.map(([value]) => value)); const [includeSamples, setIncludeSamples] = useState(false);
  const [exporting, setExporting] = useState(false); const [message, setMessage] = useState(""); const [issues, setIssues] = useState<string[]>([]);
  useEffect(() => { if (!projectId) return; fetch(`/api/exports/test-design?projectId=${encodeURIComponent(projectId)}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setSummary(body.summary); }).catch((reason) => setMessage(reason instanceof Error ? reason.message : "내보내기 대상을 불러오지 못했습니다.")); }, [projectId]);
  const download = async () => {
    setExporting(true); setMessage(""); setIssues([]);
    try {
      const response = await fetch("/api/exports/test-design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, mode, reviewStatuses: statuses, includeSamples }) });
      if (!response.ok) { const body = await response.json(); setIssues(body.issues || []); throw new Error(body.error); }
      const blob = await response.blob(); const disposition = response.headers.get("Content-Disposition") || ""; const match = disposition.match(/filename\*=UTF-8''([^;]+)/); const fileName = match ? decodeURIComponent(match[1]) : "테스트설계산출물.xlsx";
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url); setMessage("검증된 테스트 설계 Excel을 다운로드했습니다.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Excel 생성에 실패했습니다."); } finally { setExporting(false); }
  };
  return <Workspace title="산출물 내보내기" description="현재 프로젝트의 테스트 설계 결과를 6개 시트 Excel 검토본으로 생성합니다.">
    {summary ? <><div className="summary-grid workspace-summary"><article className="summary-card"><div><p>요구사항</p><strong>{summary.requirementCount}건</strong></div></article><article className="summary-card"><div><p>시나리오</p><strong>{summary.scenarioCount}건</strong></div></article><article className="summary-card"><div><p>테스트 케이스</p><strong>{summary.totalTestCaseCount}건</strong></div></article></div>
    <section className="review-card export-panel"><div className="review-heading"><div><h2>Excel 포함 범위</h2><p>다운로드 전에 미결 질문 {summary.openQuestionCount}건, 미커버 요구사항 {summary.uncoveredCount}건을 함께 확인해 주세요.</p></div></div>
      <div className="export-mode"><label><input type="radio" checked={mode === "all"} onChange={() => setMode("all")}/> 전체 검토본</label><label><input type="radio" checked={mode === "approved"} onChange={() => setMode("approved")}/> 승인 케이스 중심</label></div>
      <fieldset disabled={mode === "approved" || exporting}><legend>포함할 검토 상태</legend><div className="export-statuses">{exportStatuses.map(([value, label]) => <label key={value}><input type="checkbox" checked={statuses.includes(value)} onChange={() => setStatuses((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])}/>{label} <small>{summary.statusCounts[value] || 0}건</small></label>)}</div></fieldset>
      <label className="sample-option"><input type="checkbox" checked={includeSamples} disabled={exporting} onChange={(event) => setIncludeSamples(event.target.checked)}/> fixture 샘플 데이터 포함</label>
      <div className="export-warning"><strong>내보내기 안내</strong><p>승인 케이스 중심을 선택해도 전체 건수, 제외된 초안·확인 필요 건수와 미커버 범위는 요약 시트에 기록됩니다. 실행 상태는 모두 미실행으로 출력됩니다.</p></div>
      <button className="button primary" disabled={exporting || (mode === "all" && !statuses.length)} onClick={() => void download()}>{exporting ? "Excel 검증·생성 중" : "테스트 설계 Excel 다운로드"}</button>
      {message && <div className={`inline-message ${issues.length ? "error" : ""}`} aria-live="polite"><p>{message}</p>{issues.length > 0 && <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</div>}
    </section></> : message ? <ErrorPanel message={message}/> : <Loading/>}
  </Workspace>;
}

export function HistoryView() { const { data, error } = useProjectData(); const [filters,setFilters]=useState({target:"",action:"",source:"",from:"",to:""}); if (error) return <ErrorPanel message={error}/>; if (!data) return <Loading/>; const items=data.activities.filter(a=>(!filters.target||a.target_type===filters.target)&&(!filters.action||a.action.toLowerCase().includes(filters.action.toLowerCase()))&&(!filters.source||a.change_source===filters.source)&&(!filters.from||new Date(a.created_at)>=new Date(filters.from))&&(!filters.to||new Date(a.created_at)<=new Date(`${filters.to}T23:59:59`))); return <Workspace title="변경이력" description="현재 프로젝트의 생성·수정·결정·반영·내보내기 작업을 PostgreSQL 감사 로그에서 조회합니다."><div className="case-filters"><select value={filters.target} onChange={e=>setFilters({...filters,target:e.target.value})}><option value="">전체 대상</option>{[...new Set(data.activities.map(a=>a.target_type))].map(v=><option key={v}>{v}</option>)}</select><input placeholder="작업 검색" value={filters.action} onChange={e=>setFilters({...filters,action:e.target.value})}/><select value={filters.source} onChange={e=>setFilters({...filters,source:e.target.value})}><option value="">전체 출처</option>{[...new Set(data.activities.map(a=>a.change_source).filter(Boolean))].map(v=><option key={v} value={v}>{sourceLabel(v || "")}</option>)}</select><input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/><input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></div>{items.length ? <div className="requirement-table-wrap"><table className="requirement-table"><thead><tr><th>일시</th><th>대상·버전</th><th>작업·출처</th><th>사유</th><th>작업 주체</th><th>변경 요약</th></tr></thead><tbody>{items.map((a) => <tr key={a.id}><td>{new Date(a.created_at).toLocaleString("ko-KR")}</td><td>{a.target_type}<small>{a.target_code || "코드 없음"}{a.target_version ? ` · v${a.target_version}` : ""}</small></td><td>{a.action}<small>{sourceLabel(a.change_source || "")}</small></td><td>{a.reason || "기록 없음"}</td><td>{a.actor_label || "시스템"}</td><td><details><summary>전후 요약</summary><pre>{JSON.stringify({before:a.before_data||null,after:a.after_data||null},null,2).slice(0,2000)}</pre></details></td></tr>)}</tbody></table></div> : <Empty text="조건에 맞는 변경이력이 없습니다."/>}</Workspace>; }

function Workspace({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="document-workspace"><div className="workspace-heading"><div><span className="section-kicker">TEST PLANNING WORKSPACE</span><h1>{title}</h1><p>{description}</p></div><span className="workspace-status">실제 프로젝트 데이터</span></div>{children}</section>; }
function Loading() { return <div className="workspace-empty" aria-live="polite"><span className="spinner"/><h2>데이터를 불러오는 중입니다</h2></div>; }
function ErrorPanel({ message }: { message: string }) { return <div className="inline-message error" role="alert"><strong>데이터 조회 실패</strong><p>{message}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="workspace-empty"><h2>표시할 항목이 없습니다</h2><p>{text}</p></div>; }
function splitLines(value: FormDataEntryValue | null) { return String(value || "").split(/[\n,]/).map(item=>item.trim()).filter(Boolean); }
function sourceLabel(value: string) { return ({openai_actual:"OpenAI 실제 생성",fixture_sample:"fixture 샘플",user_direct:"사용자 직접 작성",user_edit:"사용자 수정",change_regeneration:"변경 반영 재생성"} as Record<string,string>)[value] || value || "기록 없음"; }
