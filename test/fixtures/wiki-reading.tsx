import React,{useState,useSyncExternalStore} from 'react'
import {createRoot} from 'react-dom/client'
import ReactMarkdown from 'react-markdown'
import {WikiReader} from '../../src/client/WikiReader'
import {ReadingFrame,ReadingLayer} from '../../src/client/ReadingFrame'
const surface={state:{open:true,reading:false,readingTarget:null as HTMLElement|null},listeners:new Set<()=>void>(),subscribe(fn:()=>void){surface.listeners.add(fn);return ()=>surface.listeners.delete(fn)},getSnapshot(){return surface.state},setReadingTarget(target:HTMLElement|null){surface.update({readingTarget:target})},update(patch:any){surface.state={...surface.state,...patch};surface.listeners.forEach(fn=>fn())}}
const pages=[{id:'p1',title:'资料概览',chapter:'认识资料',status:'completed',content:'# 资料概览\n\n'+Array.from({length:14},(_,i)=>`## 小节 ${i+1}\n\n${'完整性检查发现缺失字段，唯一性检查发现重复记录。'.repeat(15)}\n\n`).join('')},{id:'p2',title:'质量检查',chapter:'使用指南',status:'completed',content:'# 质量检查\n\n## 检查方法\n\n记录责任人。\n\n## 核对依据\n\n保留处理结果。'},{id:'p3',title:'待完成页面',chapter:'使用指南',status:'failed',error:'模型暂时不可用',content:''}]
function Demo(){
 const state=useSyncExternalStore(surface.subscribe,surface.getSnapshot),[selected,setSelected]=useState(pages[0]),[draft,setDraft]=useState('我的未发送草稿'),[evidence,setEvidence]=useState(false),[mounted,setMounted]=useState(true)
 const [memory]=useState<any>({})
 return <div style={{display:'grid',gridTemplateColumns:'180px minmax(0,1fr) 340px',height:'100vh',position:'relative'}}>
   <aside><button onClick={()=>{surface.update({reading:false});setMounted(!mounted)}}>切换会话</button></aside>
   <main style={{overflow:'auto'}}><h1>主对话</h1><textarea aria-label="对话草稿" value={draft} onChange={e=>setDraft(e.target.value)}/><p>{'保留对话位置。'.repeat(1200)}</p></main>
   <aside style={{minHeight:0}}>{mounted&&<ReadingFrame expanded={state.reading} target={state.readingTarget} toggle={()=>surface.update({reading:!state.reading})}>{evidence?<div><button onClick={()=>setEvidence(false)}>返回阅读</button>资料原文</div>:<WikiReader wiki={{pages}} page={selected} workspace={{title:'数据治理学习',knowledgeReady:false}} status={{label:'部分页面未完成',color:'#a66'}} select={setSelected} memory={memory} remember={(patch:any)=>Object.assign(memory,patch)} prepare={()=>{}} cancel={()=>{}} back={()=>surface.update({reading:false})} askAI={(page:any,text:string)=>{setDraft(draft+'\n讨论 '+page.title+' '+text);surface.update({reading:false})}} renderPage={(page:any)=><><ReactMarkdown>{page.content}</ReactMarkdown><button onClick={()=>setEvidence(true)}>查看来源</button></>}/>}</ReadingFrame>}</aside>
   <div data-shell-overlay style={{position:'absolute',inset:0,pointerEvents:'none'}}><ReadingLayer surface={surface}/></div>
 </div>
}
createRoot(document.getElementById('root')!).render(<Demo/> )
