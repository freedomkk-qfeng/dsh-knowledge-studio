import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {WorkspaceHome} from '../../src/client/WorkspaceHome'
import {StudioArtifact} from '../../src/client/StudioArtifact'
import {BUILTIN_CAPABILITIES} from '../../lib/capabilities'
function Demo(){
 const [view,setView]=useState('home'),[expanded,setExpanded]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState<any[]>([]),[artifact,setArtifact]=useState<any>(null),[message,setMessage]=useState('')
 const citation={evidenceId:'e1',path:'治理学习资料.md',lineStart:6,excerpt:'完整性检查发现缺失字段。'}
 const fixture={id:'report1',kind:'report',title:'数据治理入门报告',status:'completed',updatedAt:new Date().toISOString(),citations:[citation],content:{sections:[{id:'s1',heading:'先明确数据责任',body:'记录负责人、处理原因和完成时间。',evidenceIds:['e1']}]}}
 const workspace={title:'治理资料',id:'ws',files:121,capabilities:BUILTIN_CAPABILITIES,artifacts:[fixture],indexed:true,task:{message:'1 页生成失败，成功页面已保留。'}}
 const common={workspace,wiki:{pages:[{id:'p1',title:'数据质量',content:'已有正文',status:'completed'},{id:'p2',title:'协同机制',status:'failed',error:'模型输出达到长度上限'}]},status:{label:'Wiki 部分失败',color:'#9b673c',running:false},view,setView,expanded,setExpanded,query,setQuery,results,setResults,search:async()=>setResults([{id:'e1',heading:'数据质量',path:'治理学习资料.md',content:'完整性检查发现缺失字段。'}]),busy:false,error:'',refresh:()=>{},prepare:()=>setMessage('prepare'),cancel:()=>setMessage('cancel'),showWikiPage:()=>setMessage('page'),showEvidence:()=>setMessage('evidence'),invoke:(c:any)=>setMessage(c.id),openArtifact:()=>setArtifact(fixture),close:()=>setMessage('closed')}
 return <div style={{height:'100vh',fontFamily:'Microsoft YaHei, sans-serif',display:'grid',gridTemplateColumns:'minmax(0,1fr) 390px',background:'#f5f1ea'}}><main style={{padding:35}}><h1>主对话</h1><p>这里保留当前讨论，右栏按需切换内容。</p><output aria-label="action">{message}</output></main><aside style={{minHeight:0}}>{artifact?<StudioArtifact artifact={artifact} back={()=>setArtifact(null)} close={()=>setArtifact(null)} manage={async(action:string,value:string)=>{if(action==='rename')setArtifact({...artifact,title:value});else if(action==='delete')setArtifact(null);else setMessage(action)}} askAI={async()=>setMessage('ask')} showEvidence={()=>setMessage('evidence')} exportFile={async()=>({data:btoa('report'),fileName:'report.md'})}/>:<WorkspaceHome {...common}/>}</aside></div>
}
createRoot(document.getElementById('root')!).render(<Demo/> )
