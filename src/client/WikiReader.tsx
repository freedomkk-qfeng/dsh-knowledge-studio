import React,{useLayoutEffect,useRef,useState} from 'react'

const button:React.CSSProperties={font:'inherit',fontSize:12,border:'1px solid #ded7cf',borderRadius:7,padding:'7px 10px',background:'transparent',color:'inherit',cursor:'pointer'}
export function WikiReader({wiki,page,workspace,status,busy,error,select,prepare,cancel,back,askAI,renderPage,memory={},remember=()=>{}}:any){
  const article=useRef<HTMLElement>(null)
  const [collapsed,setCollapsed]=useState<Record<string,boolean>>(memory.wikiChapters||{})
  const [headings,setHeadings]=useState<{title:string,level:number}[]>([])
  const [selection,setSelection]=useState('')
  const pages=wiki?.pages||[]
  const groups=new Map<string,any[]>()
  for(const item of pages){const chapter=item.chapter?.trim()||(item.slug==='overview'?'概览':'工作区资料');groups.set(chapter,[...(groups.get(chapter)||[]),item])}
  useLayoutEffect(()=>{
    const node=article.current
    setSelection('')
    setHeadings(Array.from(node?.querySelectorAll('h2,h3')||[]).map(h=>({title:h.textContent||'',level:Number(h.tagName.slice(1))})))
    if(node)node.scrollTop=memory.scrollPositions?.[`wiki:${page?.id}`]||0
  },[page?.id,page?.content])
  const captureSelection=()=>{const selected=window.getSelection();setSelection(selected&&article.current?.contains(selected.anchorNode)&&article.current?.contains(selected.focusNode)?selected.toString().slice(0,4000):'')}
  const current=pages.findIndex((item:any)=>item.id===page?.id)
  return <section className="ks-wiki-reader" aria-label="工作区 Wiki 阅读器">
    <style>{`
      .ks-wiki-reader{height:100%;min-height:0;display:flex;flex-direction:column;container-type:inline-size;background:#fffdf9;color:#302b28;font-size:13px}
      .ks-wiki-heading{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #e6dfd6;flex-wrap:wrap}
      .ks-wiki-body{display:grid;grid-template-columns:220px minmax(0,1fr);flex:1;min-height:0}
      .ks-wiki-nav{overflow:auto;padding:18px 12px;background:#f7f4ee;border-right:1px solid #e6dfd6}
      .ks-wiki-page{display:block;width:100%;padding:9px 12px;text-align:left;border:0;background:transparent;border-radius:7px;color:inherit;cursor:pointer;font:inherit;line-height:1.5}
      .ks-wiki-page[aria-current=page]{background:#e9dfd1;color:#62472e;font-weight:600}
      .ks-wiki-page:hover{background:#eee6db}
      .ks-wiki-article{overflow:auto;padding:28px clamp(20px,5%,64px) 60px;line-height:1.9;font-size:15px;min-width:0}
      .ks-wiki-article>div{max-width:860px;margin:auto}
      .ks-wiki-article h1{font-size:28px;line-height:1.4;margin:12px 0 28px}
      .ks-wiki-article h2{font-size:21px;margin-top:32px}
      .ks-wiki-article table{display:block;max-width:100%;overflow:auto}
      .ks-wiki-toc{margin:16px 0 24px;padding:12px 16px;border:1px solid #e6dfd6;border-radius:8px;font-size:12px}
      @container(max-width:600px){.ks-wiki-body{grid-template-columns:1fr;grid-template-rows:minmax(100px,28%) minmax(0,1fr)}.ks-wiki-nav{border-right:0;border-bottom:1px solid #e6dfd6;padding:10px}.ks-wiki-heading{padding:12px}.ks-wiki-article{padding:18px;font-size:14px}}
    `}</style>
    <header className="ks-wiki-heading"><button style={button} onClick={back}>返回 Studio</button><strong style={{fontSize:17}}>工作区 Wiki</strong><span style={{color:'#857568',flex:1}}>{workspace.title}</span><span style={{fontSize:12,color:status.color}}>{status.label}</span><button style={button} disabled={busy} onClick={status.running?cancel:prepare}>{status.running?'取消生成':workspace.knowledgeReady?'更新 Wiki':'重试未成功页面'}</button></header>
    {error&&<p role="alert" style={{padding:'0 20px',color:'#a34538'}}>{error}</p>}
    <div className="ks-wiki-body">
      <nav className="ks-wiki-nav" aria-label="Wiki 章节目录">
        <div style={{fontSize:11,color:'#8b7c6b',padding:'0 10px 12px'}}>目录 · {pages.length} 页</div>
        {[...groups].map(([chapter,items])=><section key={chapter} style={{marginBottom:15}}>
          <button style={{...button,border:0,width:'100%',textAlign:'left',fontWeight:600}} aria-expanded={!collapsed[chapter]} onClick={()=>{const next={...collapsed,[chapter]:!collapsed[chapter]};setCollapsed(next);remember({wikiChapters:next})}}>{collapsed[chapter]?'▸':'▾'} {chapter} <small style={{color:'#978776'}}> {items.length}</small></button>
          {!collapsed[chapter]&&items.map(item=><button key={item.id} className="ks-wiki-page" aria-current={page?.id===item.id?'page':undefined} onClick={()=>select(item)}><span style={{color:item.status==='completed'?'#53816a':'#ad643e',fontSize:10,marginRight:7}}>{item.status==='completed'?'●':'○'}</span>{item.title}</button>)}
        </section>)}
        {!pages.length&&<p>尚无 Wiki 页面，可在上方建立。</p>}
      </nav>
      <article ref={article} className="ks-wiki-article" aria-label="Wiki 正文" onMouseUp={captureSelection} onKeyUp={captureSelection} onScroll={event=>remember({scrollPositions:{...memory.scrollPositions,[`wiki:${page?.id}`]:event.currentTarget.scrollTop}})}><div>
        {page?<>
          <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',fontSize:12,color:'#887665'}}><span style={{flex:1}}>{page.chapter||'工作区资料'} / {page.title}</span><button style={button} disabled={!page.content} onClick={()=>askAI(page,selection)}>{selection?'讨论选中内容':'问问 AI'}</button></div>
          {page.error&&<p role="alert" style={{color:'#a34538',fontSize:12}}>此页尚未完成：{page.error}</p>}
          {headings.length>1&&<details className="ks-wiki-toc"><summary style={{cursor:'pointer'}}>本页导航 · {headings.length} 节</summary>{headings.map((heading,index)=><button key={index} style={{...button,display:'block',border:0,marginLeft:heading.level===3?14:0}} onClick={()=>{const target=article.current?.querySelectorAll('h2,h3')[index];target?.scrollIntoView({block:'start',behavior:'smooth'})}}>{heading.title}</button>)}</details>}
          {page.content?renderPage(page):<p>此页还没有正文，生成后可在这里阅读。</p>}
          <footer style={{display:'flex',gap:10,justifyContent:'space-between',borderTop:'1px solid #e6dfd6',paddingTop:24,marginTop:36}}><button style={button} disabled={current<=0} onClick={()=>select(pages[current-1])}>← 上一页</button><button style={button} disabled={current<0||current>=pages.length-1} onClick={()=>select(pages[current+1])}>下一页 →</button></footer>
        </>:<p>选择目录中的页面开始阅读。你也可以返回 Studio 使用其他功能。</p>}
      </div></article>
    </div>
  </section>
}
