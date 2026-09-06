import React,{useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react'
import {createPortal} from 'react-dom'

// The public shell.overlay sits over the frame. Read the resolved first grid
// track so the workspace navigation remains available, including while resized.
export function ReadingLayer({surface}:any) {
  const ref=useRef<HTMLDivElement>(null)
  const state:any=useSyncExternalStore(surface.subscribe,surface.getSnapshot,surface.getSnapshot)
  useLayoutEffect(()=>{
    const node=ref.current!, overlay=node.closest('[data-shell-overlay]'), frame=overlay?.parentElement
    const measure=()=>{
      const first=frame?parseFloat(getComputedStyle(frame).gridTemplateColumns):0
      node.style.left=`${Number.isFinite(first)?first:0}px`
    }
    measure()
    const observer=new ResizeObserver(measure)
    if(frame){observer.observe(frame);if(frame.firstElementChild)observer.observe(frame.firstElementChild)}
    surface.setReadingTarget(node)
    return ()=>{observer.disconnect();surface.setReadingTarget(null)}
  },[surface])
  useLayoutEffect(()=>{
    const frame=ref.current?.closest('[data-shell-overlay]')?.parentElement
    const center=frame?.children[1] as HTMLElement|undefined
    if(!center||!state.reading)return
    const previous=center.inert
    center.inert=true
    return ()=>{center.inert=previous}
  },[state.open,state.reading])
  return <div ref={ref} data-studio-reading-layer="true" data-reading-active={Boolean(state.reading)} style={{position:'absolute',top:0,right:0,bottom:0,pointerEvents:'none'}}/>
}

export function ReadingFrame({expanded,target,toggle,children}:any) {
  const inline=useRef<HTMLDivElement>(null)
  // Moving a stable portal mount preserves child state, media and scroll.
  const [mount]=useState(()=>{const node=document.createElement('div');node.style.cssText='height:100%;min-height:0;display:flex;flex-direction:column;pointer-events:auto;background:#fffdf9';return node})
  const lastMode=useRef(false)
  const positions=useRef(new Map<boolean,Map<Element,{top:number,left:number}>>())
  useLayoutEffect(()=>{
    const parent=expanded&&target?target:inline.current
    const current=new Map(Array.from(mount.querySelectorAll('*')).map(node=>[node,{top:node.scrollTop,left:node.scrollLeft}]))
    positions.current.set(lastMode.current,current)
    const restore=positions.current.get(Boolean(expanded))||current
    const media=Array.from(mount.querySelectorAll('video,audio')).map(node=>({node:node as HTMLMediaElement,playing:!(node as HTMLMediaElement).paused}))
    parent?.appendChild(mount)
    for(const [node,value] of restore)node.scrollTo({top:value.top,left:value.left,behavior:'instant'})
    lastMode.current=Boolean(expanded)
    for(const item of media)if(item.playing)void item.node.play().catch(()=>{})
  },[expanded,target,mount])
  useLayoutEffect(()=>()=>mount.remove(),[mount])
  return <div ref={inline} style={{height:'100%',minHeight:0}}>{createPortal(<>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'8px 14px',borderBottom:'1px solid #e6dfd6',background:'#f7f3ed',fontSize:12,color:'#786c60'}}>
      <span>{expanded?'阅读模式':'工作区内容'}</span><button onClick={toggle} style={{border:'1px solid #d9d0c5',borderRadius:7,padding:'5px 10px',background:'#fffdf9',color:'#514337',cursor:'pointer'}}>{expanded?'返回对话':'展开阅读'}</button>
    </div>
    <div style={{flex:1,minHeight:0}}>{children}</div>
  </>,mount)}</div>
}
