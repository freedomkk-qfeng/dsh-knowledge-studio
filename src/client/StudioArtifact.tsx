import React,{useEffect,useRef,useState} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {StudioIcon,primaryFormats} from './StudioIcon'

const btn:React.CSSProperties={border:'1px solid #ddd7d0',background:'transparent',borderRadius:7,padding:'6px 9px',font:'inherit',fontSize:12,color:'inherit',cursor:'pointer'}
const secondary:React.CSSProperties={borderTop:'1px solid #e8e2da',padding:'14px 0',marginTop:12}
const summaryStyle:React.CSSProperties={cursor:'pointer',color:'#6e655b',fontSize:12}
const itemsOf=(c:any)=>c?.sections??c?.nodes??c?.rows??c?.slides??c?.segments??c?.scenes??[]
function fileBlob(result:any,format:string) {
  const bytes=Uint8Array.from(atob(result.data),(c:string)=>c.charCodeAt(0))
  const mime:Record<string,string>={poster:'image/jpeg',mp4:'video/mp4',wav:'audio/wav',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pdf:'application/pdf'}
  return new Blob([bytes],{type:mime[format]||'application/octet-stream'})
}
function MediaPreview({id,format,exportFile}:{id:string;format:string;exportFile:any}) {
  const [url,setURL]=useState(''),[poster,setPoster]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
  const exporter=useRef(exportFile);exporter.current=exportFile
  useEffect(()=>{
    let cancelled=false,objectURL='',posterURL=''
    setURL('');setPoster('');setError('')
    if(format==='mp4')void exporter.current('poster').then((result:any)=>{if(!cancelled){posterURL=URL.createObjectURL(fileBlob(result,'poster'));setPoster(posterURL)}}).catch(()=>{})
    void (async()=>{try{
      const result=await exporter.current(format)
      if(cancelled)return
      objectURL=URL.createObjectURL(fileBlob(result,format));setURL(objectURL)
    }catch(e:any){if(!cancelled)setError(e.message||String(e))}})()
    return ()=>{cancelled=true;if(objectURL)URL.revokeObjectURL(objectURL);if(posterURL)URL.revokeObjectURL(posterURL)}
  },[id,format,attempt])
  return <div data-studio-media-preview style={{marginBottom:20}}>
    {error?<div role="alert" style={{padding:24,background:'#f7f3ed',borderRadius:10}}>预览暂时不可用。{error}<p><button style={btn} onClick={()=>setAttempt(v=>v+1)}>重试预览</button></p></div>:!url?<div role="status" style={{padding:40,textAlign:'center',background:'#f3eee8',borderRadius:10}}>正在载入{format==='mp4'?'视频':'音频'}预览…</div>:format==='mp4'?<video controls preload="auto" src={url} poster={poster||undefined} onError={()=>setError('浏览器无法读取此视频，可下载文件查看。')} style={{width:'100%',maxHeight:'65vh',objectFit:'contain',display:'block',background:'#151515',borderRadius:10}}/>:<div style={{padding:24,background:'#f2eef6',borderRadius:10}}><audio controls preload="metadata" src={url} onError={()=>setError('浏览器无法读取此音频，可下载文件收听。')} style={{width:'100%',display:'block'}}/></div>}
  </div>
}
function SlidePreview({content,index,setIndex}:any) {
  const slide=content?.slides?.[index];if(!slide)return null
  return <><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}><button style={btn} disabled={index===0} onClick={()=>setIndex(index-1)}>上一页</button><span style={{flex:1,textAlign:'center',color:'#80766b',fontSize:12}}>内容预览 · {index+1} / {content.slides.length}</span><button style={btn} disabled={index===content.slides.length-1} onClick={()=>setIndex(index+1)}>下一页</button></div><article style={{padding:24,background:'#f3eee5',borderRadius:10,minHeight:190}}><h2 style={{fontSize:23,lineHeight:1.4}}>{slide.heading}</h2><ul style={{paddingLeft:20}}>{slide.bullets.map((text:string,i:number)=><li key={i} style={{marginBottom:12}}>{text}</li>)}</ul></article><details style={secondary}><summary style={summaryStyle}>本页讲稿</summary><p>{slide.notes||'本页没有讲稿。'}</p></details></>
}
export function StudioArtifact({artifact,back,close,manage,exportFile,askAI,showEvidence,children}:any) {
  if(!artifact)return <div style={{padding:20}}>正在读取成果… <button style={btn} onClick={back}>返回</button></div>
  return <ArtifactView key={artifact.id} {...{artifact,back,close,manage,exportFile,askAI,showEvidence,children}}/>
}
function ArtifactView({artifact,back,close,manage,exportFile,askAI,showEvidence,children}:any) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[rename,setRename]=useState(false),[title,setTitle]=useState(''),[remove,setRemove]=useState(false),[actions,setActions]=useState(false),[slideIndex,setSlideIndex]=useState(0)
  const [download,setDownload]=useState<{url:string;name:string;format:string}|null>(null)
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url)},[download])
  const run=async(fn:any)=>{setBusy(true);setError('');try{await fn()}catch(e:any){setError(e.message||String(e))}finally{setBusy(false)}}
  const active=['queued','running'].includes(artifact.status),content=artifact.content,primary=primaryFormats[artifact.kind],isMedia=['audio','video'].includes(artifact.kind)
  const file=async(format:string)=>{
    if(!format)return
    const result=await exportFile(format)
    if(!mounted.current)return
    const url=URL.createObjectURL(fileBlob(result,format))
    setDownload({url,name:result.fileName,format})
    const link=document.createElement('a');link.href=url;link.download=result.fileName;document.body.appendChild(link);link.click();link.remove()
  }
  const formats=['md','json','pdf',...(artifact.kind==='table'?['csv','xlsx']:[]),...(artifact.kind==='report'?['docx']:[]),...(artifact.kind==='slides'?['pptx','html']:[]),...(artifact.exports??[]).map((f:any)=>f.format)]
  const itemLinks=(item:any)=><span style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>{item.evidenceIds?.map((id:string)=>{
    const index=artifact.citations?.findIndex((c:any)=>c.evidenceId===id),c=artifact.citations?.[index];return c?<button key={id} style={{...btn,padding:'2px 6px',fontSize:10}} onClick={()=>showEvidence(c)} title={c.path}>[{index+1}]{c.fresh===false?' 已变化':''}</button>:null
  })}</span>
  const articles=itemsOf(content).map((item:any,index:number)=><article key={item.id} style={{padding:'8px 0 18px'}}><h3 style={{fontSize:isMedia?14:18}}>{item.heading||(item.speaker?`讲述者 ${item.speaker}`:`场景 ${index+1}`)}</h3>{item.bullets&&<ul>{item.bullets.map((b:string,i:number)=><li key={i}>{b}</li>)}</ul>}<ReactMarkdown remarkPlugins={[remarkGfm]} components={{img:()=>null}}>{item.body||item.text||item.narration||item.notes||''}</ReactMarkdown></article>)
  const node=(item:any,depth=0):any=><details key={item.id} open={depth<1} style={{margin:'8px 0',paddingLeft:depth?12:0,borderLeft:depth?'2px solid #e5dfd7':undefined}}><summary style={{cursor:'pointer',fontWeight:600,padding:7}}>{item.label}</summary><div style={{padding:8}}>{item.body}{itemLinks(item)}{content.nodes.filter((n:any)=>n.parentId===item.id).map((n:any)=>node(n,depth+1))}</div></details>
  return <section data-studio-artifact={artifact.kind} style={{height:'100%',minHeight:0,display:'flex',flexDirection:'column',background:'#fffdf9',color:'#302b28'}}>
    <header style={{display:'flex',alignItems:'center',gap:8,padding:12,borderBottom:'1px solid #e8e2da'}}><button style={btn} aria-label="返回 Studio" onClick={back}>←</button><StudioIcon kind={artifact.kind}/><strong style={{fontSize:14,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{artifact.title}</strong><button style={btn} aria-label="关闭成果" onClick={close}>×</button></header>
    <div style={{display:'flex',gap:6,padding:'10px 12px',flexWrap:'wrap',alignItems:'center',borderBottom:'1px solid #eee'}}>
      {content&&primary&&<button style={{...btn,background:'#344d60',color:'white',borderColor:'#344d60',display:'inline-flex',alignItems:'center',gap:6}} disabled={busy||active||(isMedia&&!artifact.exports?.some((f:any)=>f.format===primary))} onClick={()=>run(()=>file(primary))}><StudioIcon kind={artifact.kind} size={15}/>下载 {primary.toUpperCase()}</button>}
      {content&&!['quiz','flashcards'].includes(artifact.kind)&&<button style={btn} disabled={busy} onClick={()=>run(()=>askAI(''))}>问问 AI</button>}
      <button style={{...btn,marginLeft:'auto'}} aria-expanded={actions} disabled={busy} onClick={()=>setActions(!actions)}>更多操作</button>
    </div>
    {actions&&<div style={{display:'flex',gap:6,padding:'8px 12px',flexWrap:'wrap',background:'#f7f3ed'}}><button style={btn} disabled={busy} onClick={()=>{setTitle(artifact.title);setRename(!rename)}}>重命名</button><button style={btn} disabled={busy} onClick={()=>run(()=>manage(active?'cancel':'retry',''))}>{active?'取消生成':'生成新版本'}</button><button style={btn} disabled={busy} onClick={()=>setRemove(!remove)}>移除</button>{content&&<select aria-label="导出成果" style={btn} disabled={busy} value="" onChange={e=>run(()=>file(e.target.value))}><option value="">其他格式…</option>{[...new Set(formats)].map((f:any)=><option key={f} value={f}>{f.toUpperCase()}</option>)}</select>}</div>}
    {download&&<div role="status" style={{padding:'6px 12px',fontSize:11,color:'#80766b'}}>文件已准备 · <a style={{color:'#344d60'}} href={download.url} download={download.name}>保存 {download.format.toUpperCase()}</a></div>}
    {rename&&<form style={{display:'flex',padding:12,gap:6}} onSubmit={e=>{e.preventDefault();void run(async()=>{await manage('rename',title);setRename(false)})}}><input aria-label="成果名称" value={title} onChange={e=>setTitle(e.target.value)} style={{minWidth:0,flex:1}}/><button style={btn}>保存</button></form>}
    {remove&&<div style={{padding:12}}>从成果列表移除？<button style={btn} onClick={()=>run(()=>manage('delete',''))}>移除</button><button style={btn} onClick={()=>setRemove(false)}>保留</button></div>}
    {error&&<p role="alert" style={{padding:'0 12px',color:'#a02932'}}>{error}</p>}
    {active&&<p style={{padding:16}}>正在生成 · {artifact.message||artifact.phase}</p>}
    {!active&&artifact.status!=='completed'&&<div role="alert" style={{padding:16,color:'#a02932'}}>{artifact.status==='cancelled'?'已取消。':'生成未完成。'}{content?'已保留生成的文本，可展开查看。':''}{artifact.message&&<details style={{marginTop:8}}><summary>查看原因</summary><div style={{maxHeight:140,overflow:'auto',overflowWrap:'anywhere',fontSize:12}}>{artifact.message}</div></details>}</div>}
    {['quiz','flashcards'].includes(artifact.kind)?<div style={{flex:1,minHeight:0}}>{artifact.status==='completed'?children:null}</div>:<div style={{overflow:'auto',padding:18,flex:1,fontSize:13,lineHeight:1.7}}>
      {isMedia&&artifact.exports?.some((f:any)=>f.format===primary)&&<MediaPreview id={artifact.id} format={primary} exportFile={exportFile}/>}
      {isMedia&&content?<details style={secondary} data-studio-script><summary style={summaryStyle}>{artifact.kind==='video'?'分镜与旁白':'逐字稿'} · {itemsOf(content).length} {artifact.kind==='video'?'个场景':'段'}</summary>{articles}</details>:artifact.kind==='slides'?<SlidePreview content={content} index={slideIndex} setIndex={setSlideIndex}/>:artifact.kind==='mindmap'?content?.nodes?.filter((n:any)=>!n.parentId).map((n:any)=>node(n)):artifact.kind==='table'?<div style={{overflowX:'auto'}}><table style={{borderCollapse:'collapse',width:'100%'}}><thead><tr>{content?.columns.map((c:string,i:number)=><th key={i} style={{padding:10,borderBottom:'2px solid #ccc',textAlign:'left',background:'#edf3ef'}}>{c}</th>)}</tr></thead><tbody>{content?.rows.map((row:any)=><tr key={row.id}>{row.cells.map((cell:string,i:number)=><td key={i} style={{padding:10,borderBottom:'1px solid #e8e2da',minWidth:90}}>{cell}</td>)}</tr>)}</tbody></table></div>:articles}
      {content&&<details style={secondary} data-studio-sources><summary style={summaryStyle}>参考来源 · {new Set(artifact.citations?.map((c:any)=>c.path)).size} 份资料</summary><p style={{fontSize:11,color:'#80766b'}}>{artifact.sourceScope}</p>{artifact.citations?.map((c:any,index:number)=><div key={c.evidenceId} style={{padding:'10px 0',borderBottom:'1px solid #eee',overflowWrap:'anywhere'}}><button style={{...btn,textAlign:'left',border:0,padding:0}} onClick={()=>showEvidence(c)}>[{index+1}] {c.path} · {c.locator==='page'?`第 ${c.pageStart} 页`:`第 ${c.lineStart} 行`}{c.fresh===false?' · 原文已变化':''}</button><p style={{fontSize:11,color:'#80766b',margin:'5px 0'}}>{itemsOf(content).filter((item:any)=>item.evidenceIds?.includes(c.evidenceId)).map((item:any)=>item.heading||item.label||(artifact.kind==='table'?`第 ${content.rows.indexOf(item)+1} 行`:artifact.kind==='audio'?`第 ${content.segments.indexOf(item)+1} 段`:item.id)).join('、')}</p></div>)}</details>}
    </div>}
  </section>
}
