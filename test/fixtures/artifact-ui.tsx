import React,{useState,useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {StudioArtifact} from '../../src/client/StudioArtifact'
function wave(){const b=new Uint8Array(1644),v=new DataView(b.buffer);const s=(i:number,t:string)=>{for(const c of t)b[i++]=c.charCodeAt(0)};s(0,'RIFF');v.setUint32(4,1636,true);s(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,1600,true);return btoa(String.fromCharCode(...b))}
function Demo(){
 const [id,setID]=useState('slow'),[ticks,setTicks]=useState(0),[calls,setCalls]=useState(0),pending=useRef<any>(null),attempts=useRef(0)
 const kind=['slow','audio','failure'].includes(id)?'audio':id
 const artifact={id,kind,title:id,status:'completed',exports:[{format:'wav'}],citations:[{evidenceId:'e1',path:'source.md',lineStart:1}],content:kind==='audio'?{segments:[{id:'s1',speaker:'A',text:'隐藏的逐字稿',evidenceIds:['e1']}]}:kind==='slides'?{slides:[{id:'s1',heading:'演示内容',bullets:['重点'],notes:'隐藏讲稿',evidenceIds:['e1']}]}:kind==='table'?{columns:['指标'],rows:[{id:'r1',cells:['完整性'],evidenceIds:['e1']}]}:{sections:[{id:'s1',heading:'报告内容',body:'正文',evidenceIds:['e1']}]}}
 return <div style={{height:'100vh',display:'grid',gridTemplateColumns:'220px 390px'}}><nav>{['slow','audio','failure','report','slides','table'].map(x=><button key={x} onClick={()=>setID(x)}>{x}</button>)}<button onClick={()=>setTicks(ticks+1)}>刷新状态</button><button onClick={()=>pending.current?.({data:wave(),fileName:'slow.wav'})}>完成旧请求</button><output data-calls>{calls}</output><output>{ticks}</output></nav><StudioArtifact artifact={artifact} back={()=>{}} close={()=>{}} manage={()=>{}} askAI={()=>{}} showEvidence={()=>{}} exportFile={async(format:string)=>{setCalls(c=>c+1);if(id==='slow')return new Promise(r=>{pending.current=r});if(id==='failure'&&attempts.current++===0)throw new Error('测试加载失败');return {data:wave(),fileName:id+'.'+format}}}/></div>
}
createRoot(document.getElementById('root')!).render(<Demo/> )
