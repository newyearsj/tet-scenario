"use client";

import { useEffect, useState } from "react";

type Project = { id: string; name: string | null };

export default function ProjectSwitcher({ onChangeProject }: { onChangeProject: () => void }) {
  const [project,setProject]=useState<Project|null>(null);
  useEffect(()=>{const load=()=>fetch("/api/projects").then(async response=>{const body=await response.json();if(!response.ok)return;const id=window.localStorage.getItem("testagent-project-id");setProject((body.projects as Project[]).find(item=>item.id===id)??null);}).catch(()=>undefined);void load();const sync=(event:Event)=>{const detail=(event as CustomEvent<Project>).detail;if(detail)setProject(detail);else void load();};window.addEventListener("testagent-project-changed",sync);return()=>window.removeEventListener("testagent-project-changed",sync);},[]);
  if(!project)return null;
  return <div className="project-switcher"><span>현재 프로젝트</span><strong>{project.name?.trim()||"이름 없는 프로젝트"}</strong><button onClick={onChangeProject}>프로젝트 변경</button></div>;
}
