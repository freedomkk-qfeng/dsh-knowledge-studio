import {StudioIcon,primaryFormats} from './StudioIcon'
import React,{useState,useRef,useEffect} from 'react'
const b:React.CSSProperties={border:'1px solid #ded7cf',borderRadius:8,background:'transparent',padding:'7px 10px',font:'inherit',fontSize:12,color:'inherit',cursor:'pointer'}
export function WorkspaceHome({workspace,wiki,status,view,setView,expanded,setExpanded,query,setQuery,results,setResults,search,busy,error,refresh,prepare,cancel,showWikiPage,showEvidence,invoke,openArtifact,close,scrollPositions={},rememberScroll=()=>{}}:any) {
  const [searched,setSearched]=useState(false)
  const scrollRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollPositions[view]||0},[view])
  const title=view==='wiki'?'工作区 Wiki':view==='search'?'搜索资料':'Studio'
  return <section data-knowledge-studio-details="true" style={{height:'100%',minHeight:0,display:'flex',flexDirection:'column',background:'#fffdf9',color:'#302b28',fontSize:13}}>
    <header style={{display:'flex',alignItems:'center',gap:9,padding:15,borderBottom:'1px solid #e6dfd6'}}>{view!=='home'&&<button style={b} onClick={()=>setView('home')}>←</button>}<strong style={{fontSize:16}}>{title}</strong><span style={{fontSize:11,color:'#857a6d',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{workspace.title}</span><button style={{...b,marginLeft:'auto',border:0}} aria-label="关闭面板" onClick={close}>×</button></header>
    <div ref={scrollRef} onScroll={e=>rememberScroll(view,e.currentTarget.scrollTop)} style={{overflowY:'auto',padding:16,flex:1}}>
      {error&&<p role="alert" style={{color:'#ad333f'}}>{error} <button style={b} onClick={refresh}>重试</button></p>}
      {view==='home'&&<>
        <section style={{borderBottom:'1px solid #e6dfd6',paddingBottom:16,marginBottom:22}}>
          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}><button aria-expanded={expanded} style={{...b,border:0,padding:'5px 0'}} onClick={()=>setExpanded(!expanded)}>工作区知识 {expanded?'⌃':'⌄'}</button><span style={{fontSize:11,color:status.color}}>{status.running?'正在生成 Wiki':status.label}</span></div>
          <div style={{display:'flex',gap:7,marginTop:8}}><button style={b} onClick={()=>setView('wiki')}>打开 Wiki</button><button style={b} onClick={()=>setView('search')}>搜索资料</button></div>
          {expanded&&<div style={{marginTop:12,fontSize:12,color:'#776b60'}}><p>{workspace.files||0} 份已索引资料{workspace.indexedAt?` · ${new Date(workspace.indexedAt).toLocaleString()}`:''}</p>{status.running&&<p>{status.label}</p>}{workspace.task?.message&&<p role="alert">{workspace.task.message}</p>}<button style={b} disabled={busy||!workspace.id} onClick={status.running?cancel:prepare}>{status.running?'取消任务':workspace.knowledgeReady?'更新 Wiki':workspace.indexed?'重试未成功页面':'建立工作区知识'}</button></div>}
        </section>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:9}}>{workspace.capabilities.filter((c:any)=>c.available).map((c:any)=><button key={c.id} data-knowledge-studio-capability={c.id} style={{...b,textAlign:'left',padding:'14px 12px',minHeight:100,background:'#f7f3ed'}} onClick={()=>invoke(c)}><span style={{display:'flex',alignItems:'center',gap:8}}><StudioIcon kind={c.id} size={22} tile/><strong style={{fontSize:14}}>{c.title}</strong></span><span style={{display:'block',fontSize:11,color:'#84776a',lineHeight:1.5,marginTop:6}}>{c.description}</span></button>)}</div>
        <div style={{display:'flex',alignItems:'center',marginTop:26,marginBottom:10}}><strong>最近成果</strong><span style={{marginLeft:'auto',fontSize:11,color:'#857a6d'}}>{workspace.artifacts?.length||0} 项</span></div>
        {!workspace.artifacts?.length&&<p style={{color:'#857a6d',fontSize:12}}>选择一种形式开始，成果会保存在这里。</p>}
        {workspace.artifacts?.map((item:any)=><button key={item.id} style={{...b,width:'100%',textAlign:'left',border:0,borderBottom:'1px solid #ece6de',borderRadius:0,padding:'12px 0',display:'flex',alignItems:'center',gap:10}} onClick={()=>openArtifact(item.id)}><StudioIcon kind={item.kind} tile/><span style={{minWidth:0,flex:1}}><strong style={{display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.title}</strong><span style={{fontSize:11,color:'#857a6d'}}>{workspace.capabilities.find((c:any)=>c.id===item.kind)?.title||item.kind}{primaryFormats[item.kind]?' · '+primaryFormats[item.kind].toUpperCase():''} · {item.status==='completed'?new Date(item.updatedAt).toLocaleString():item.status==='running'?'生成中':item.status==='cancelled'?'已取消':'未完成'}</span></span></button>)}
      </>}
      {view==='wiki'&&<>
        <div style={{display:'flex',alignItems:'center',gap:9}}><span style={{color:status.color,flex:1}}>{status.label}</span><button style={b} disabled={busy||!workspace.id} onClick={status.running?cancel:prepare}>{status.running?'取消':workspace.knowledgeReady?'更新':'重试 / 建立'}</button></div>
        {workspace.task?.message&&<p role="alert" style={{fontSize:12,color:'#9e4d37'}}>{workspace.task.message}</p>}
        {!wiki?.pages?.length&&<p style={{color:'#857a6d'}}>尚无 Wiki 页面。你仍可以直接使用 Studio。</p>}
        {wiki?.pages?.map((page:any)=><div key={page.id} style={{padding:'14px 0',borderBottom:'1px solid #e6dfd6'}}><button style={{...b,border:0,padding:0,textAlign:'left'}} disabled={!page.content} onClick={()=>showWikiPage(page)}><span style={{fontSize:10,color:page.status==='completed'?'#438367':'#ac613e'}}>{page.status==='completed'?'●':'○'} </span><strong>{page.title}</strong></button>{page.error&&<p role="alert" style={{fontSize:11,color:'#a34538',overflowWrap:'anywhere'}}>{page.error}</p>}</div>)}
      </>}
      {view==='search'&&<>
        <form onSubmit={e=>{e.preventDefault();setSearched(true);void search()}} style={{display:'flex',gap:6}}><input aria-label="搜索资料" placeholder="关键词、文件名或概念" value={query} onChange={e=>setQuery(e.target.value)} style={{flex:1,minWidth:0,border:'1px solid #ded7cf',borderRadius:8,padding:9}}/><button style={b} disabled={busy||!query.trim()}>搜索</button></form>
        <div style={{display:'flex',alignItems:'center',marginTop:12,fontSize:11,color:'#857a6d'}}><span>{busy?'搜索中…':`${results.length} 条结果`}</span><button style={{...b,marginLeft:'auto',border:0}} onClick={()=>{setResults([]);setQuery('');setSearched(false)}}>清空</button><button style={{...b,border:0}} onClick={()=>setView('home')}>关闭搜索</button></div>
        {!busy&&searched&&!results.length&&<p>没有匹配结果，可以换一个关键词。</p>}
        <div style={{maxHeight:'65vh',overflowY:'auto'}}>{results.map((result:any)=><button key={result.evidenceId||result.id} style={{...b,border:0,borderBottom:'1px solid #e6dfd6',borderRadius:0,width:'100%',textAlign:'left',padding:'14px 0'}} onClick={()=>showEvidence(result)}><strong>{result.heading||result.path}</strong><small style={{display:'block',color:'#857a6d',margin:'5px 0'}}>{result.path}</small><span style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',lineHeight:1.6}}>{result.content}</span></button>)}</div>
      </>}
    </div>
  </section>
}
