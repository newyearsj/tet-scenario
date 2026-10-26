"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { generateActualScenarios, type SavedDocument, uploadDocuments } from "./api";
import type { ScenarioGenerationResult } from "./types";

const ACCEPTED_EXTENSIONS = ["txt", "md", "xlsx", "xls", "csv"];
const STAGES = ["파일 읽는 중", "요구사항·화면 분석 중", "시나리오 생성 중"];
const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`;
};

export default function DocumentAnalysis({ onViewScenarios }: { onViewScenarios: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [result, setResult] = useState<ScenarioGenerationResult | null>(null);
  const [savedDocuments, setSavedDocuments] = useState<SavedDocument[]>([]);
  const [projectId, setProjectId] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const analysisController = useRef<AbortController | null>(null);

  useEffect(() => {
    const initializeProject = async () => {
      const storageKey = "testagent-project-id";
      const response = await fetch("/api/projects");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const projects = Array.isArray(body.projects) ? body.projects : [];
      const existing = window.localStorage.getItem(storageKey);
      const selected = projects.find((project: { id: string }) => project.id === existing) ?? projects[0];
      if (!selected) throw new Error("사용할 수 있는 프로젝트가 없습니다.");
      const id = selected.id;
      window.localStorage.setItem(storageKey, id);
      setProjectId(id);
    // 프로젝트 식별자는 이후 서버 인증·소유권 연결 전까지 브라우저에 보관한다.
    };
    void initializeProject().catch((reason) => setAnalysisError(reason instanceof Error ? reason.message : "프로젝트를 불러오지 못했습니다."));
  }, []);

  const validateAndSelect = (candidates: File[]) => {
    setDragging(false);
    setFileError("");
    const accepted = candidates.filter((file) => ACCEPTED_EXTENSIONS.includes(file.name.split(".").pop()?.toLowerCase() ?? ""));
    const rejected = candidates.filter((file) => !accepted.includes(file));
    if (rejected.length) setFileError(`${rejected.map((file) => file.name).join(", ")} 파일은 지원하지 않습니다. TXT, MD, XLSX, XLS, CSV 형식으로 변환해 주세요.`);
    if (accepted.length) {
      setFiles((current) => [...current, ...accepted]);
      setResult(null);
      setAnalysisError("");
    }
  };
  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    validateAndSelect(Array.from(event.target.files ?? []));
    event.target.value = "";
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!analyzing) validateAndSelect(Array.from(event.dataTransfer.files ?? []));
  };
  const finish = () => { setAnalyzing(false); setAnalysisStage(""); analysisController.current = null; };

  const runActual = async () => {
    if (!files.length || analyzing || !projectId) return;
    setAnalyzing(true); setAnalysisError(""); setResult(null); setAnalysisStage(STAGES[0]);
    const controller = new AbortController(); analysisController.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const uploaded = await uploadDocuments(projectId, files, controller.signal);
      setSavedDocuments(uploaded.documents); setAnalysisStage(STAGES[1]);
      timer = setTimeout(() => setAnalysisStage(STAGES[2]), 1400);
      const next = await generateActualScenarios(projectId, uploaded.documents.map((document) => document.id), controller.signal);
      setResult(next);
    } catch (error) {
      setAnalysisError(error instanceof Error && error.name === "AbortError" ? "시나리오 생성을 취소했습니다. 결과는 저장되지 않았습니다." : error instanceof Error ? error.message : "시나리오 생성에 실패했습니다.");
    } finally { if (timer) clearTimeout(timer); finish(); }
  };

  return <section className="document-workspace" aria-labelledby="document-analysis-title">
    <div className="workspace-heading"><div><span className="section-kicker">DOCUMENT ANALYSIS</span><h1 id="document-analysis-title">문서 분석</h1><p>기획 문서를 분석해 근거가 연결된 테스트 시나리오 초안을 만듭니다.</p></div><span className="workspace-status">Supabase PostgreSQL 저장</span></div>
    <div className="tab-panel"><div className="doc-two-column"><div className="doc-primary-card">
      <div className="card-heading"><div><span className="card-step-label">TSA-DOC-001 · TSA-TS-001</span><h2>시나리오 생성 자료 등록</h2></div><span className="ai-pill">OpenAI 시나리오 생성</span></div>
      <div className={`drop-zone ${dragging ? "dragging" : ""} ${analyzing ? "disabled" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (!analyzing) setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop} onClick={() => !analyzing && fileInput.current?.click()} onKeyDown={(event) => { if (!analyzing && (event.key === "Enter" || event.key === " ")) fileInput.current?.click(); }} role="button" tabIndex={analyzing ? -1 : 0} aria-disabled={analyzing}>
        <span className="drop-icon">↑</span><strong>{dragging ? "이곳에 파일을 놓아주세요" : "파일을 끌어다 놓거나 클릭해 선택하세요"}</strong><p>여러 문서를 한 번에 선택하거나 추가할 수 있습니다.</p><span className="choose-file">파일 선택</span><input ref={fileInput} type="file" multiple className="visually-hidden" accept=".txt,.md,.xlsx,.xls,.csv,text/plain,text/markdown,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={analyzing} onChange={onInputChange}/>
      </div>
      {fileError && <div className="inline-message error" role="alert"><strong>업로드할 수 없는 파일이 있습니다</strong><p>{fileError}</p></div>}
      {files.length > 0 && <div className="selected-files"><div className="selected-files-head"><strong>선택한 파일 {files.length}개</strong><span>합계 {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}</span></div>{files.map((file, index) => <div className="selected-file" key={`${file.name}-${file.lastModified}-${index}`}><span className="file-kind">{file.name.split(".").pop()?.toUpperCase()}</span><div><strong>{file.name}</strong><p>{formatBytes(file.size)} · 분석 전 · 브라우저 임시 보관</p></div><button type="button" disabled={analyzing} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`${file.name} 제거`}>×</button></div>)}</div>}
      {savedDocuments.length > 0 && <div className="saved-documents"><strong>DB 저장 결과</strong>{savedDocuments.map((document) => <p key={document.id}><span>{document.file_name}</span><b>{document.parse_status === "over_limit" ? `본문 초과 · ${document.unanalyzed_character_count.toLocaleString()}자 미분석` : document.parse_status === "empty" ? "빈 문서" : "파싱 완료"}</b></p>)}</div>}
      <div className="analysis-buttons"><button className="analyze-button" disabled={!files.length || analyzing || !projectId} onClick={runActual}>{analyzing ? <><span className="spinner"/>시나리오 생성 중</> : `${files.length || ""}개 문서로 시나리오 생성`}</button></div>
      <div className="analysis-live" aria-live="polite" aria-atomic="true">{analyzing && <><strong>OpenAI 생성 진행 상태</strong><p>{analysisStage}</p><div className="stage-track">{STAGES.map((stage) => <span key={stage} className={stage === analysisStage ? "current" : ""}>{stage}</span>)}</div><button className="cancel-analysis" onClick={() => analysisController.current?.abort()}>생성 취소</button></>}{analysisError && <div className="inline-message error" role="alert"><p>{analysisError}</p><button onClick={runActual}>다시 시도</button></div>}{result&&!result.isSample&&<div className="actual-result-notice"><strong>테스트 시나리오 {result.scenarios.length}건이 생성되었습니다.</strong><p>저장된 결과는 테스트 시나리오 화면에서 검토할 수 있습니다.</p><button className="button primary" onClick={onViewScenarios}>테스트 시나리오 보기</button></div>}</div>
    </div><aside className="policy-card"><h2>입력 정책</h2><dl><div><dt>지원 형식</dt><dd>TXT, MD, XLSX, XLS, CSV</dd></div><div><dt>최대 파일 크기</dt><dd><span className="needs-check">확인 필요</span><br/>현재 정책과 설정에 정의되지 않았습니다.</dd></div><div><dt>분석 본문 제한</dt><dd>문서 1건당 80,000자<br/><small>파일 크기 제한과 별도이며, 초과 원문은 보존하고 미분석 범위를 표시합니다.</small></dd></div></dl><div className="policy-note"><strong>임의 정책 생성 금지</strong><p>자료에 없는 역할·화면·업무 규칙은 확정하지 않고 확인 필요로 표시합니다.</p></div></aside></div></div>
  </section>;
}
