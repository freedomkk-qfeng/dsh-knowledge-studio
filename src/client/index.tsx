import {StudioIcon} from './StudioIcon'
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { knowledgeStudioRemote } from './remote.js'
import { StudioArtifact } from './StudioArtifact.js'
import { WorkspaceHome } from './WorkspaceHome.js'
import { WikiReader } from './WikiReader.js'
import { ReadingFrame, ReadingLayer } from './ReadingFrame.js'
// @ts-expect-error Host capability descriptors are shared browser-safe data.
import { BUILTIN_CAPABILITIES } from '../../lib/capabilities.js'

export const inject = ['slots', 'remote', 'sessions', 'layout']
const zh =
  typeof navigator !== 'undefined' &&
  navigator.language.toLowerCase().startsWith('zh')

const t = zh
  ? {
      title: '工作区',
      knowledgeTitle: '工作区知识',
      toggle: '显示或隐藏工作区面板',
      local: '本机保存',
      loading: '正在读取…',
      noWorkspace: '当前会话不属于任何工作区。',
      preparing: '正在准备工作区知识',
      ready: '工作区知识已就绪',
      notReady: '工作区知识未启用',
      incomplete: '工作区知识尚未完成',
      failed: '准备失败',
      interrupted: '知识未完成',
      files: '个文件',
      chunks: '个片段',
      updated: '更新于',
      search: '搜索当前工作区',
      searchAction: '搜索',
      noResults: '没有找到相关内容，可以换一个关键词。',
      studio: 'Studio',
      studioHint: '把当前工作区转成可阅读或可交互的内容',
      recent: '最近成果',
      browseKnowledge: '浏览工作区知识',
      updateKnowledge: '更新',
      buildKnowledge: '建立工作区知识',
      continueKnowledge: '继续准备',
      cancel: '取消任务',
      openSource: '打开原文',
      back: '返回',
      close: '关闭工作区知识',
      privacy:
        '文件解析、索引和检索在本机完成。建立知识页面或生成内容时，仅将必要片段交给当前模型。',
      working: '处理中',
      error: '操作失败',
      generate: '开始生成',
      generating: '正在生成',
      interruptedArtifact: '生成被中断',
      askAI: '问问 AI',
      evidence: '查看依据',
      submitAnswer: '提交答案',
      next: '下一个',
      previous: '上一个',
      correct: '回答正确',
      incorrect: '回答错误',
      flip: '翻到背面',
      known: '已掌握',
      review: '再复习',
      reset: '重新开始',
      consentTitle: '建立工作区知识',
      consentBody:
        '将整理当前工作区的资料，生成可浏览的知识页面。这个过程会调用当前模型，并消耗 credits 或模型额度。',
      consentFollowup:
        '具体用量取决于资料规模和模型。你也可以暂不建立，直接使用 Studio。后续更新由你主动发起。',
      consentCancel: '暂不开启',
      consentConfirm: '开始建立',
    }
  : {
      title: 'Workspace',
      knowledgeTitle: 'Workspace Knowledge',
      toggle: 'Show or hide the workspace panel',
      local: 'Stored locally',
      loading: 'Loading…',
      noWorkspace: 'This session is not attached to a workspace.',
      preparing: 'Preparing workspace knowledge',
      ready: 'Workspace knowledge is ready',
      notReady: 'Workspace knowledge is off',
      incomplete: 'Workspace knowledge is incomplete',
      failed: 'Preparation failed',
      interrupted: 'Knowledge is incomplete',
      files: 'files',
      chunks: 'chunks',
      updated: 'Updated',
      search: 'Search this workspace',
      searchAction: 'Search',
      noResults: 'No matching content. Try another term.',
      studio: 'Studio',
      studioHint: 'Turn this workspace into readable or interactive content',
      recent: 'Recent artifacts',
      browseKnowledge: 'Browse workspace knowledge',
      updateKnowledge: 'Update',
      buildKnowledge: 'Build workspace knowledge',
      continueKnowledge: 'Continue preparing',
      cancel: 'Cancel task',
      openSource: 'Open source',
      back: 'Back',
      close: 'Close workspace knowledge',
      privacy:
        'Parsing, indexing, and retrieval stay local. Knowledge pages and generated content send only necessary excerpts to the current model.',
      working: 'Working',
      error: 'Operation failed',
      generate: 'Generate',
      generating: 'Generating',
      interruptedArtifact: 'Generation interrupted',
      askAI: 'Ask AI',
      evidence: 'View evidence',
      submitAnswer: 'Submit answer',
      next: 'Next',
      previous: 'Previous',
      correct: 'Correct',
      incorrect: 'Incorrect',
      flip: 'Show answer',
      known: 'Got it',
      review: 'Review again',
      reset: 'Start over',
      consentTitle: 'Build workspace knowledge',
      consentBody:
        'This reads and organizes the current workspace for grounded chat, knowledge browsing, and Studio. The first build calls your current model and consumes credits.',
      consentFollowup:
        'Usage depends on the materials and model. You can use Studio without this preparation. Updates are started manually.',
      consentCancel: 'Not now',
      consentConfirm: 'Start building',
    }

async function unwrap<T = any>(operation: Promise<any>): Promise<T> {
  const result = await operation
  if (result?.ok === true) return result.value as T
  throw new Error(
    result?.error?.message || result?.error?.code || 'Remote operation failed',
  )
}

// One outstanding snapshot per service/path, even if several surfaces subscribe.
const workspaceRequests = new WeakMap<object, Map<string, Promise<any>>>()
function workspaceRequest(service: any, cwd: string) {
  let requests = workspaceRequests.get(service)
  if (!requests) workspaceRequests.set(service, requests = new Map())
  let request = requests.get(cwd)
  if (!request) {
    request = unwrap(service.workspaceForPath(cwd))
    requests.set(cwd, request)
    void request.finally(() => requests!.delete(cwd)).catch(() => {})
  }
  return request
}
function pendingWorkspace(cwd: string) {
  return { id: '', path: cwd, title: cwd.split(/[\\/]/).filter(Boolean).at(-1), unknown: true,
    capabilities: BUILTIN_CAPABILITIES, artifacts: [], indexed: false, files: 0, chunks: 0 }
}
function useWorkspace(service: any, cwd: string) {
  const [value, setValue] = useState<any>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    setValue(null)
    setError('')
    const load = async () => {
      const warning = setTimeout(() => {
        if (!disposed) setError(zh ? '工作区服务响应较慢，基础创作仍可使用。' : 'Workspace service is slow. Basic creation remains available.')
      }, 8000)
      try {
        const result = await workspaceRequest(service, cwd)
        if (!disposed) { setValue(result ? { ...result, requestedCwd: cwd } : result); setError(result ? '' : t.noWorkspace) }
      } catch {
        if (!disposed) setError(zh ? '无法连接工作区服务，请重试。' : 'Cannot connect to workspace service. Retry.')
      } finally {
        clearTimeout(warning)
        if (!disposed) timer = setTimeout(load, 2000)
      }
    }
    if (cwd) void load()
    return () => { disposed = true; clearTimeout(timer) }
  }, [service, cwd, retry])
  return { workspace: value?.requestedCwd === cwd ? value : pendingWorkspace(cwd),
    error, refresh: () => setRetry(value => value + 1) }
}

const colors = {
  border: 'var(--dsw-alias-border-l2, #e3d9d4)',
  bg: 'var(--dsw-alias-bg-layer-1, #fff)',
  soft: 'var(--dsw-alias-bg-layer-2, #f7f3f1)',
  text: 'var(--dsw-alias-label-primary, #251c19)',
  muted: 'var(--dsw-alias-label-secondary, #746965)',
  accent: 'var(--dsw-alias-brand-primary, #963442)',
  green: 'var(--dsw-alias-state-success-primary, #397a56)',
  amber: 'var(--dsw-alias-state-warning-primary, #936d13)',
  red: 'var(--dsw-alias-state-error-primary, #ad2c3b)',
}
const button: React.CSSProperties = {
  minHeight: 32,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '5px 10px',
  background: colors.bg,
  color: colors.text,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const primaryButton: React.CSSProperties = {
  ...button,
  borderColor: colors.accent,
  background: colors.accent,
  color: '#fff',
}
const field: React.CSSProperties = {
  width: '100%',
  minHeight: 36,
  border: `1px solid ${colors.border}`,
  borderRadius: 9,
  padding: '7px 9px',
  color: colors.text,
  background: colors.bg,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

function KnowledgeIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22.5z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
    </svg>
  )
}

function SidebarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M15 4v16" />
    </svg>
  )
}

type Target = { sessionId: string; cwd: string }
type SurfaceSnapshot = { open: boolean; sessionId: string; reading?: boolean; readingTarget?: HTMLElement | null }
type SessionMemory = {
  view?: string
  expanded?: boolean
  scrollPositions?: Record<string,number>
  query?: string
  results?: any[]
  evidence?: any
  wikiPage?: any
  wikiChapters?: Record<string,boolean>
  artifactId?: string
  awaitingArtifactSince?: string
}

class KnowledgeSurface {
  private snapshot: SurfaceSnapshot = Object.freeze({
    open: false,
    sessionId: '',
  })
  private listeners = new Set<() => void>()
  private activation: { activate(): void; deactivate(): void } | undefined
  private memory = new Map<string, SessionMemory>()
  private dismissed = new Set<string>()
  private target: Target | null = null
  constructor(private layout: any) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getSnapshot = () => this.snapshot
  setReading = (reading: boolean) => {
    this.snapshot = Object.freeze({...this.snapshot,reading})
    this.listeners.forEach(listener=>listener())
  }
  setReadingTarget = (readingTarget: HTMLElement | null) => {
    if(this.snapshot.readingTarget===readingTarget)return
    this.snapshot = Object.freeze({...this.snapshot,readingTarget})
    this.listeners.forEach(listener=>listener())
  }
  bind = (activation: { activate(): void; deactivate(): void } | undefined) => {
    this.activation = activation
    if (activation && this.snapshot.open) activation.activate()
  }
  currentTarget = () => this.target
  sessionState = (sessionId: string) => this.memory.get(sessionId) ?? {}
  remember = (sessionId: string, patch: SessionMemory) =>
    this.memory.set(sessionId, { ...this.sessionState(sessionId), ...patch })
  private show = (target: Target) => {
    this.target = target
    this.snapshot = Object.freeze({ ...this.snapshot, open: true, sessionId: target.sessionId, reading: this.snapshot.sessionId===target.sessionId&&this.snapshot.reading })
    this.activation?.activate()
    this.layout.openDetails()
    this.listeners.forEach((listener) => listener())
  }
  open = (target: Target) => {
    this.dismissed.delete(target.sessionId)
    this.show(target)
  }
  enter = (target: Target) => {
    if (this.dismissed.has(target.sessionId)) return
    this.show(target)
  }
  close = () => {
    this.layout.closeDetails()
    this.activation?.deactivate()
    this.snapshot = Object.freeze({ ...this.snapshot, open: false, sessionId: '', reading:false })
    this.listeners.forEach((listener) => listener())
  }
  dismiss = (target: Target | null = this.target) => {
    if (target?.sessionId) this.dismissed.add(target.sessionId)
    this.close()
  }
  toggle = (target: Target) =>
    this.snapshot.open && this.snapshot.sessionId === target.sessionId
      ? this.dismiss(target)
      : this.open(target)
}

function knowledgeState(workspace: any) {
  if (!workspace || workspace.unknown) return { label: zh ? '知识状态待确认' : 'Knowledge status unknown', color: colors.muted, running: false }
  const task = workspace?.task
  const running = task && ['running', 'stopping'].includes(task.status)
  if (running) {
    return {
      label: taskLabel(task),
      color: colors.amber,
      running: true,
    }
  }
  if (task?.status === 'failed')
    return { label: t.failed, color: colors.red, running: false }
  if (task && ['interrupted', 'killed'].includes(task.status))
    return { label: t.interrupted, color: colors.amber, running: false }
  if (['degraded','partial'].includes(workspace?.knowledgeQuality) || task?.status === 'partial') return { label: 'Wiki 部分失败', color: colors.amber, running: false }
  if (workspace?.knowledgeReady)
    return { label: t.ready, color: colors.green, running: false }
  if (workspace?.indexed)
    return { label: t.incomplete, color: colors.amber, running: false }
  return { label: t.notReady, color: colors.muted, running: false }
}

function HeaderAction({ useSession, surface, sessionMeta, service }: any) {
  const sessionId = useSession((snapshot: any) => snapshot.sessionId)
  const state = useSyncExternalStore(
    surface.subscribe,
    surface.getSnapshot,
    surface.getSnapshot,
  ) as SurfaceSnapshot
  const meta = sessionMeta(sessionId)
  const { workspace } = useWorkspace(service, meta.cwd)
  if (!meta.cwd) return null
  const active = state.open && state.sessionId === sessionId
  const status = knowledgeState(workspace)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {workspace && (
        <span
          data-knowledge-studio-status="true"
          title={t.knowledgeTitle}
          style={{
            minHeight: 26,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 9px',
            border: `1px solid ${colors.border}`,
            borderRadius: 999,
            color: colors.muted,
            background: 'transparent',
            fontSize: 10,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: status.color,
            }}
          />
          {status.label}
        </span>
      )}
      <button
        type="button"
        data-knowledge-studio-entry="true"
        aria-label={t.toggle}
        aria-pressed={active}
        title={t.toggle}
        onClick={() => surface.toggle(meta)}
        style={{
          ...button,
          width: 30,
          minHeight: 28,
          display: 'grid',
          placeItems: 'center',
          padding: 0,
          borderColor: active ? colors.border : 'transparent',
          background: active ? colors.soft : 'transparent',
          color: active ? colors.text : colors.muted,
        }}
      >
        <SidebarIcon size={15} />
      </button>
    </span>
  )
}

function taskLabel(task: any) {
  if (!task) return ''
  const phase: Record<string, string> = {
    scan: '读取资料',
    write: '整理内容',
    'wiki-plan': '组织知识结构',
    'wiki-retrieve': '查找相关内容',
    'wiki-write': '生成知识页面',
    done: '完成',
  }
  const amount =
    task.total == null
      ? `${task.processed || 0}`
      : `${task.processed || 0}/${task.total}`
  return `${phase[task.phase] || task.phase || t.working} · ${amount}${task.currentPath ? ` · ${task.currentPath}` : ''}`
}

function location(value: any) {
  if (value.locator === 'page')
    return `p.${value.pageStart}${value.pageEnd && value.pageEnd !== value.pageStart ? `–${value.pageEnd}` : ''}`
  return `L${value.lineStart ?? '?'}${value.lineEnd && value.lineEnd !== value.lineStart ? `–${value.lineEnd}` : ''}`
}

function Markdown({ page, openEvidence }: any) {
  const citations = page?.citations ?? []
  const numbers = new Map(
    citations.map((citation: any, index: number) => [
      String(citation.evidenceId),
      index + 1,
    ]),
  )
  const source = String(page?.content ?? '').replace(
    /\[\^([^\]]+)\]/g,
    (_match, id) =>
      numbers.has(String(id))
        ? `[${numbers.get(String(id))}](knowledge-evidence:${id})`
        : '',
  )
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) =>
        url.startsWith('knowledge-evidence:') ? url : defaultUrlTransform(url)
      }
      components={{
        a: ({ href = '', children, ...props }) =>
          href.startsWith('knowledge-evidence:') ? (
            <button
              type="button"
              onClick={() =>
                openEvidence(
                  citations.find(
                    (item: any) => item.evidenceId === href.slice(19),
                  ),
                )
              }
              style={{
                border: 0,
                borderRadius: 10,
                minWidth: 20,
                height: 20,
                padding: '0 5px',
                margin: '0 2px',
                background: '#f0dadd',
                color: colors.accent,
                cursor: 'pointer',
                fontSize: 10,
              }}
            >
              {children}
            </button>
          ) : (
            <a href={href} {...props}>
              {children}
            </a>
          ),
        h1: ({ children }) => (
          <h1 style={{ margin: '0 0 16px', fontSize: 23 }}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 style={{ margin: '24px 0 9px', fontSize: 17 }}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ margin: '18px 0 7px', fontSize: 14 }}>{children}</h3>
        ),
        p: ({ children }) => (
          <p style={{ margin: '8px 0', lineHeight: 1.72 }}>{children}</p>
        ),
        table: ({ children }) => (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            style={{
              border: `1px solid ${colors.border}`,
              padding: 7,
              background: colors.soft,
              textAlign: 'left',
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td style={{ border: `1px solid ${colors.border}`, padding: 7 }}>
            {children}
          </td>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  )
}

function parameterVisible(parameter:any,values:Record<string,any>) {
  return (!parameter.when || Object.entries(parameter.when).every(([key,value])=>values[key]===value)) && (!parameter.whenNot || Object.entries(parameter.whenNot).every(([key,value])=>values[key]!==value)) && (!parameter.whenNonempty || Boolean(values[parameter.whenNonempty]))
}
function ParameterDialog({ capability, busy, close, submit }: any) {
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      (capability.parameters ?? []).map((parameter: any) => [
        parameter.id,
        parameter.default,
      ]),
    ),
  )
  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2200,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'rgba(32,24,22,.32)',
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={capability.title}
        onSubmit={(event) => {
          event.preventDefault()
          void submit(values)
        }}
        style={{
          width: 'min(640px, calc(100vw - 40px))',
          maxHeight: 'min(720px, calc(100vh - 40px))',
          display: 'grid',
          gridTemplateRows: '56px minmax(0,1fr) 60px',
          overflow: 'hidden',
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          background: colors.bg,
          color: colors.text,
          boxShadow: '0 22px 70px rgba(36,23,20,.22)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 18px',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <StudioIcon kind={capability.id} />
          <strong>{capability.title}</strong>
          <button
            type="button"
            aria-label={t.close}
            onClick={close}
            style={{ ...button, marginLeft: 'auto', border: 0, fontSize: 17 }}
          >
            ×
          </button>
        </header>
        <div style={{ overflow: 'auto', padding: '18px' }}>
          {(capability.parameters ?? []).filter((p:any)=>parameterVisible(p,values)).map((parameter: any) => (
            <label
              key={parameter.id}
              style={{ display: 'block', marginBottom: 17 }}
            >
              <strong
                style={{ display: 'block', marginBottom: 7, fontSize: 12 }}
              >
                {parameter.label}
              </strong>
              {parameter.type === 'select' ? (
                <select
                  style={field}
                  value={values[parameter.id]}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [parameter.id]: event.target.value,
                      ...(parameter.id==='provider'?{voice:'',voiceB:''}:{}),
                    }))
                  }
                >
                  {parameter.options.filter((o:any)=>parameterVisible(o,values)).map((option: any) => (
                    <option key={String(option.value)} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : parameter.type === 'text' ? (
                <input style={field} value={values[parameter.id] ?? ''} placeholder={parameter.placeholder} onChange={event=>setValues(current=>({...current,[parameter.id]:event.target.value}))}/>
              ) : (
                <textarea
                  autoFocus
                  style={{ ...field, minHeight: 120, resize: 'vertical' }}
                  value={values[parameter.id] ?? ''}
                  placeholder={parameter.placeholder}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [parameter.id]: event.target.value,
                    }))
                  }
                />
              )}
            </label>
          ))}
        </div>
        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8,
            padding: '0 18px',
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <button type="button" style={button} onClick={close}>
            {t.cancel}
          </button>
          <button type="submit" disabled={busy} style={primaryButton}>
            {busy ? t.working : t.generate}
          </button>
        </footer>
      </form>
    </div>
  )
}

function KnowledgeConsentDialog({ workspace, busy, close, submit }: any) {
  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) close()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2300,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'rgba(32,24,22,.28)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.consentTitle}
        data-knowledge-studio-consent="true"
        style={{
          width: 'min(500px, calc(100vw - 40px))',
          overflow: 'hidden',
          border: `1px solid ${colors.border}`,
          borderRadius: 15,
          background: colors.bg,
          color: colors.text,
          boxShadow: '0 22px 70px rgba(36,23,20,.22)',
        }}
      >
        <div style={{ padding: '20px 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 32,
                height: 32,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 9,
                background: colors.accent,
                color: '#fff',
              }}
            >
              <KnowledgeIcon size={16} />
            </span>
            <span>
              <strong style={{ display: 'block', fontSize: 15 }}>
                {t.consentTitle}
              </strong>
              <span style={{ color: colors.muted, fontSize: 10 }}>
                {workspace?.title}
              </span>
            </span>
          </div>
          <p style={{ margin: '17px 0 0', fontSize: 12, lineHeight: 1.65 }}>
            {t.consentBody}
          </p>
          <p
            style={{
              margin: '9px 0 0',
              color: colors.muted,
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            {t.consentFollowup}
          </p>
          {workspace?.files > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: '9px 10px',
                borderRadius: 9,
                background: colors.soft,
                color: colors.muted,
                fontSize: 10,
              }}
            >
              {workspace.files} {t.files} · {workspace.chunks} {t.chunks}
            </div>
          )}
        </div>
        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 18px',
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <button type="button" disabled={busy} style={button} onClick={close}>
            {t.consentCancel}
          </button>
          <button
            type="button"
            disabled={busy}
            style={primaryButton}
            onClick={() => void submit()}
          >
            {busy ? t.working : t.consentConfirm}
          </button>
        </footer>
      </div>
    </div>
  )
}

function InlineParameterPopover({ capability, busy, close, submit }: any) {
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      (capability.parameters ?? []).map((parameter: any) => [
        parameter.id,
        parameter.default,
      ]),
    ),
  )
  return (
    <form
      role="dialog"
      aria-label={capability.title}
      data-knowledge-studio-parameter-popover="true"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(values)
      }}
      style={{
        position: 'absolute',
        right: 0,
        bottom: 'calc(100% + 9px)',
        zIndex: 1200,
        width: 'min(340px, calc(100vw - 36px))',
        padding: 14,
        border: `1px solid ${colors.border}`,
        borderRadius: 13,
        background: colors.bg,
        color: colors.text,
        boxShadow: '0 14px 42px rgba(36,23,20,.18)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>{capability.title}</strong>
        <button
          type="button"
          aria-label={t.close}
          onClick={close}
          style={{ ...button, minHeight: 26, marginLeft: 'auto', border: 0 }}
        >
          ×
        </button>
      </div>
      {(capability.parameters ?? []).map((parameter: any) => (
        <label key={parameter.id} style={{ display: 'block', marginTop: 10 }}>
          <span
            style={{
              display: 'block',
              marginBottom: 5,
              color: colors.muted,
              fontSize: 10,
            }}
          >
            {parameter.label}
          </span>
          {parameter.type === 'select' ? (
            <select
              style={{ ...field, minHeight: 32 }}
              value={values[parameter.id]}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [parameter.id]: event.target.value,
                }))
              }
            >
              {parameter.options.map((option: any) => (
                <option key={String(option.value)} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <textarea
              autoFocus
              style={{ ...field, minHeight: 62, resize: 'vertical' }}
              value={values[parameter.id] ?? ''}
              placeholder={parameter.placeholder}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [parameter.id]: event.target.value,
                }))
              }
            />
          )}
        </label>
      ))}
      <button
        type="submit"
        disabled={busy}
        style={{ ...primaryButton, width: '100%', marginTop: 13 }}
      >
        {busy ? t.working : t.generate}
      </button>
    </form>
  )
}

function ArtifactShell({ artifact, children }: any) {
  return <section data-knowledge-studio-artifact="true" style={{height:'100%',overflow:'auto',padding:'16px',boxSizing:'border-box',background:colors.bg,color:colors.text}}>
    {artifact?.sourceScope && <p style={{color:colors.muted,fontSize:11}}>{artifact.sourceScope}</p>}
    {children}
  </section>
}
function ArtifactPanel({ artifact, back, close, update, askAI, showEvidence }: any) {
  if (!artifact)
    return (
      <ArtifactShell artifact={null} back={back} close={close}>
        <p>{t.loading}</p>
      </ArtifactShell>
    )
  if (['running', 'queued'].includes(artifact.status))
    return (
      <ArtifactShell artifact={artifact} back={back} close={close}>
        <div style={{ marginTop: '20vh', textAlign: 'center' }}>
          <span
            style={{
              display: 'inline-grid',
              width: 44,
              height: 44,
              placeItems: 'center',
              borderRadius: 14,
              color: colors.accent,
              background: colors.soft,
            }}
          >
            ◌
          </span>
          <h2 style={{ fontSize: 18 }}>{t.generating}</h2>
          <p style={{ color: colors.muted, fontSize: 11 }}>
            {artifact.phase === 'retrieve'
              ? '正在检索可核验内容'
              : '正在组织交互内容'}
            {artifact.total ? ` · ${artifact.processed}/${artifact.total}` : ''}
          </p>
        </div>
      </ArtifactShell>
    )
  if (['failed', 'interrupted', 'cancelled'].includes(artifact.status))
    return (
      <ArtifactShell artifact={artifact} back={back} close={close}>
        <div style={{ marginTop: '16vh', textAlign: 'center' }}>
          <h2 style={{ color: colors.red, fontSize: 18 }}>
            {artifact.status === 'interrupted'
              ? t.interruptedArtifact
              : t.failed}
          </h2>
          <p style={{ color: colors.muted, fontSize: 11 }}>
            {artifact.message}
          </p>
        </div>
      </ArtifactShell>
    )

  const citation = (id: string) =>
    artifact.citations?.find((item: any) => item.evidenceId === id)
  if (artifact.kind === 'quiz') {
    const questions = artifact.content?.questions ?? []
    const current = Math.max(
      0,
      Math.min(
        questions.length - 1,
        Number(artifact.interaction?.current) || 0,
      ),
    )
    const question = questions[current]
    if (!question)
      return (
        <ArtifactShell artifact={artifact} back={back} close={close}>
          <p>{t.error}</p>
        </ArtifactShell>
      )
    const answer = artifact.interaction?.answers?.[question.id]
    const revealed = Boolean(artifact.interaction?.revealed?.[question.id])
    const correct = revealed && Number(answer) === Number(question.correctIndex)
    const completed = questions.filter(
      (item: any) => artifact.interaction?.revealed?.[item.id],
    ).length
    return (
      <ArtifactShell artifact={artifact} back={back} close={close}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', color: colors.muted, fontSize: 10 }}>
            <span>
              {current + 1}/{questions.length}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              {completed}/{questions.length}
            </span>
          </div>
          <div
            style={{
              height: 3,
              margin: '8px 0 24px',
              borderRadius: 3,
              overflow: 'hidden',
              background: colors.soft,
            }}
          >
            <div
              style={{
                width: `${((current + 1) / questions.length) * 100}%`,
                height: '100%',
                background: colors.accent,
              }}
            />
          </div>
          <h2 style={{ fontSize: 18, lineHeight: 1.5 }}>{question.question}</h2>
          <div style={{ display: 'grid', gap: 9, marginTop: 18 }}>
            {question.options.map((option: string, index: number) => {
              const selected = Number(answer) === index
              const isCorrect = revealed && index === question.correctIndex
              const wrong = revealed && selected && !isCorrect
              return (
                <button
                  key={index}
                  disabled={revealed}
                  onClick={() => void update('answer', question.id, index)}
                  style={{
                    ...button,
                    minHeight: 48,
                    padding: '10px 12px',
                    textAlign: 'left',
                    borderColor: isCorrect
                      ? colors.green
                      : wrong
                        ? colors.red
                        : selected
                          ? colors.accent
                          : colors.border,
                    background: isCorrect
                      ? 'rgba(57,122,86,.11)'
                      : wrong
                        ? 'rgba(173,44,59,.09)'
                        : selected
                          ? colors.soft
                          : colors.bg,
                  }}
                >
                  <strong style={{ marginRight: 9 }}>
                    {String.fromCharCode(65 + index)}.
                  </strong>
                  {option}
                </button>
              )
            })}
          </div>
          {!revealed && (
            <button
              disabled={answer == null}
              onClick={() => void update('reveal', question.id, true)}
              style={{ ...primaryButton, marginTop: 16 }}
            >
              {t.submitAnswer}
            </button>
          )}
          {revealed && (
            <section
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 11,
                border: `1px solid ${correct ? colors.green : colors.red}`,
                background: correct
                  ? 'rgba(57,122,86,.08)'
                  : 'rgba(173,44,59,.07)',
              }}
            >
              <strong style={{ color: correct ? colors.green : colors.red }}>
                {correct ? `✓ ${t.correct}` : `× ${t.incorrect}`}
              </strong>
              <p style={{ margin: '8px 0 0', lineHeight: 1.65, fontSize: 12 }}>
                {question.explanation}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 7,
                  flexWrap: 'wrap',
                  marginTop: 11,
                }}
              >
                {question.evidenceIds.map((id: string, index: number) => (
                  <button
                    key={id}
                    style={button}
                    onClick={() => void showEvidence(citation(id))}
                  >
                    {t.evidence} {index + 1}
                  </button>
                ))}
                <button style={button} onClick={() => void askAI(question.id)}>
                  {t.askAI}
                </button>
              </div>
            </section>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
            <button
              disabled={current === 0}
              style={button}
              onClick={() => void update('current', question.id, current - 1)}
            >
              {t.previous}
            </button>
            <button
              disabled={current >= questions.length - 1}
              style={{ ...primaryButton, marginLeft: 'auto' }}
              onClick={() => void update('current', question.id, current + 1)}
            >
              {t.next}
            </button>
          </div>
          {completed === questions.length && (
            <button
              style={{ ...button, width: '100%', marginTop: 12 }}
              onClick={() => void update('reset', '', true)}
            >
              {t.reset}
            </button>
          )}
          {questions.some((q:any)=>artifact.interaction?.revealed?.[q.id] && artifact.interaction?.answers?.[q.id]!==q.correctIndex) && <details style={{marginTop:18}}><summary style={{cursor:'pointer'}}>错题回顾</summary>{questions.map((q:any,index:number)=>artifact.interaction?.revealed?.[q.id] && artifact.interaction?.answers?.[q.id]!==q.correctIndex ? <button key={q.id} style={{...button,display:'block',textAlign:'left',marginTop:8,width:'100%'}} onClick={()=>void update('current',q.id,index)}>{index+1}. {q.question}</button>:null)}</details>}
        </div>
      </ArtifactShell>
    )
  }

  const cards = artifact.content?.cards ?? []
  const current = Math.max(
    0,
    Math.min(cards.length - 1, Number(artifact.interaction?.current) || 0),
  )
  const card = cards[current]
  if (!card)
    return (
      <ArtifactShell artifact={artifact} back={back} close={close}>
        <p>{t.error}</p>
      </ArtifactShell>
    )
  const flipped = Boolean(artifact.interaction?.flipped)
  const grades = artifact.interaction?.grades ?? {}
  const known = Object.values(grades).filter(Boolean).length
  const grade = async (value: boolean) => {
    await update('grade', card.id, value)
    if (current < cards.length - 1)
      await update('current', card.id, current + 1)
  }
  return (
    <ArtifactShell artifact={artifact} back={back} close={close}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', color: colors.muted, fontSize: 10 }}>
          <span>
            {current + 1}/{cards.length}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            {known} {t.known}
          </span>
        </div>
        <button
          onClick={() => void update('flip', card.id, !flipped)}
          style={{
            width: '100%',
            minHeight: 300,
            display: 'grid',
            placeItems: 'center',
            marginTop: 16,
            padding: 30,
            border: `1px solid ${flipped ? colors.accent : colors.border}`,
            borderRadius: 18,
            background: flipped ? colors.soft : colors.bg,
            color: colors.text,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 10px 30px rgba(36,23,20,.06)',
          }}
        >
          <span
            style={{
              maxWidth: 560,
              fontSize: flipped ? 16 : 20,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {flipped ? card.back : card.front}
          </span>
        </button>
        <p style={{ textAlign: 'center', color: colors.muted, fontSize: 10 }}>
          {flipped ? '' : t.flip}
        </p>
        {flipped && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 9,
                marginTop: 14,
              }}
            >
              <button style={button} onClick={() => void grade(false)}>
                {t.review}
              </button>
              <button style={primaryButton} onClick={() => void grade(true)}>
                {t.known}
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 7,
                flexWrap: 'wrap',
                marginTop: 12,
              }}
            >
              {card.evidenceIds.map((id: string, index: number) => (
                <button
                  key={id}
                  style={button}
                  onClick={() => void showEvidence(citation(id))}
                >
                  {t.evidence} {index + 1}
                </button>
              ))}
              <button style={button} onClick={() => void askAI(card.id)}>
                {t.askAI}
              </button>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <button
            disabled={current === 0}
            style={button}
            onClick={() => void update('current', card.id, current - 1)}
          >
            {t.previous}
          </button>
          <button
            disabled={current >= cards.length - 1}
            style={{ ...button, marginLeft: 'auto' }}
            onClick={() => void update('current', card.id, current + 1)}
          >
            {t.next}
          </button>
        </div>
        {Object.keys(grades).length === cards.length && (
          <button
            style={{ ...button, width: '100%', marginTop: 12 }}
            onClick={() => void update('reset', '', true)}
          >
            {t.reset}
          </button>
        )}
      </div>
    </ArtifactShell>
  )
}

function artifactRequest(capability: any, parameters: any) {
  return `请基于当前工作区生成${capability.title}，参数：${JSON.stringify(parameters)}。请调用 knowledge_studio_create_artifact 工具，将交互成果保存在 Studio。必须保留上述数量、音色、配音、字幕等选项（on/off 转换为工具要求的类型），不得自行缩小数量或更换语音服务。失败时如实说明，重试应保留原参数。无需先建立工作区知识；资料不足时请明确说明。`
}

function DetailsPanel({
  useSession,
  useInput,
  inputActions,
  surface,
  service,
  sessionMeta,
  openFile,
  closePanel,
  initialView = 'home',
}: any) {
  const sessionId = useSession((snapshot: any) => snapshot.sessionId)
  const draft = useInput((snapshot:any)=>snapshot.draft)
  const meta = sessionMeta(sessionId)
  const remembered = surface.sessionState(sessionId)
  const { workspace, error: workspaceError, refresh } = useWorkspace(service, meta.cwd)
  const [wiki, setWiki] = useState<any>(null)
  const wikiRequest=useRef(0)
  const [query, setQueryState] = useState(remembered.query || '')
  const [results, setResultsState] = useState<any[]>(remembered.results || [])
  const [evidence, setEvidenceState] = useState<any>(
    remembered.evidence || null,
  )
  const [wikiPage, setWikiPageState] = useState<any>(
    remembered.wikiPage || null,
  )
  const [artifactId, setArtifactIdState] = useState(remembered.artifactId || '')
  const [view,setViewState] = useState(initialView === 'home' ? remembered.view || 'home' : initialView)
  const [expanded,setExpandedState] = useState(remembered.expanded || false)
  const setView=(value:string)=>{setViewState(value);surface.remember(sessionId,{view:value});surface.setReading(value==='wiki')}
  const setExpanded=(value:boolean)=>{setExpandedState(value);surface.remember(sessionId,{expanded:value})}
  const [artifact, setArtifact] = useState<any>(null)
  const [dialog, setDialog] = useState<any>(null)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const remember = (patch: SessionMemory) => surface.remember(sessionId, patch)
  const setQuery = (value: string) => {
    setQueryState(value)
    remember({ query: value })
  }
  const setResults = (value: any[]) => {
    setResultsState(value)
    remember({ results: value })
  }
  const setEvidence = (value: any) => {
    setEvidenceState(value)
    remember({ evidence: value })
  }
  const setWikiPage = (value: any) => {
    setWikiPageState(value)
    remember({ wikiPage: value })
  }
  const setArtifactId = (value: string) => {
    setArtifactIdState(value)
    remember({ artifactId: value })
  }

  useEffect(() => {
    let disposed = false
    // Wiki reads must not join the bulk index queue; load after committed changes.
    if (!workspace.id || !workspace.indexed || ['scan', 'write'].includes(workspace.task?.phase)) return
    void unwrap<any>(service.wiki(workspace.id)).then(value => {
      if (!disposed) setWiki(value.wiki)
    }).catch(() => { if (!disposed) setError('知识页面暂时不可用，Studio 仍可使用。') })
    return () => { disposed = true }
  }, [workspace.id, workspace.indexedAt, workspace.task?.phase, workspace.task?.processed])

  useEffect(() => {
    let disposed = false
    if (!artifactId) {
      setArtifact(null)
      return () => {
        disposed = true
      }
    }
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const value = await unwrap<any>(service.readArtifact(artifactId))
        if (!disposed) setArtifact(value.artifact)
      } catch (cause: any) {
        if (!disposed) setError(cause?.message || String(cause))
      } finally {
        if (!disposed) timer = setTimeout(load, 2000)
      }
    }
    void load()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [artifactId])

  useEffect(()=>{
    if(artifact?.kind==='report'&&artifact.status==='completed')surface.setReading(true)
  },[artifact?.id,artifact?.status])

  useEffect(() => {
    const since = surface.sessionState(sessionId).awaitingArtifactSince
    if (!since) return
    const result = workspace.artifacts?.find((item: any) => item.sessionId === sessionId && item.createdAt >= since)
    if (result) {
      setArtifactId(result.id)
      surface.remember(sessionId, { awaitingArtifactSince: undefined })
    }
  }, [workspace.artifacts, sessionId])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (cause: any) {
      setError(cause?.message || String(cause))
    } finally {
      setBusy(false)
    }
  }
  const search = () =>
    run(async () => {
      const value = await unwrap<any>(
        service.search(workspace.id, query.trim(), 12, ''),
      )
      setResults(value.results || [])
    })
  const showEvidence = (item: any) =>
    run(async () => {
      const id = item.evidenceId
      const value = id && !id.startsWith('file_')
        ? (await unwrap<any>(service.readEvidence(workspace.id, id))).evidence
        : item
      setEvidence(
        value
          ? { ...value, path: value.path || item.path, content: value.content || value.excerpt || item.excerpt }
          : { ...item, content: item.content || item.excerpt || '原始内容已经变化。' },
      )
    })
  const showWikiPage = (page: any) => {
    const request=++wikiRequest.current
    setWikiPage(page)
    return run(async()=>{
      const value=(await unwrap<any>(service.readWikiPage(workspace.id,page.id))).page
      if(request===wikiRequest.current)setWikiPage(value)
    })
  }
  const invoke = (capability: any, parameters: any = {}) =>
    run(async () => {
      if (capability.execution === 'conversation') {
        inputActions.setDraft(capability.prompt || BUILTIN_CAPABILITIES.find((item: any) => item.id === capability.id)?.prompt)
        inputActions.submit()
        return
      }
      if (capability.execution === 'artifact') {
        surface.setReading(false)
        surface.remember(sessionId, { awaitingArtifactSince: new Date().toISOString(), artifactId: '' })
        setDialog(null)
        setArtifactId('')
        inputActions.setDraft(artifactRequest(capability, parameters))
        inputActions.submit()
        return
      }
      const target = workspace.id ? workspace : await workspaceRequest(service, meta.cwd)
      if (!target?.id) throw new Error(t.noWorkspace)
      const result = await unwrap<any>(
        service.invokeStudio(
          target.id,
          capability.id,
          parameters,
          sessionId,
        ),
      )
      if (result.action === 'compose') {
        inputActions.setDraft(result.prompt)
        inputActions.submit()
        surface.close()
        closePanel?.()
        return
      }
      if (result.action === 'artifact') {
        setDialog(null)
        setArtifact(result.artifact)
        setArtifactId(result.artifact.id)
        return
      }
      await refresh()
    })
  const updateArtifact = async (action: string, itemId: string, value: any) => {
    const result = await unwrap<any>(
      service.updateArtifactInteraction(artifact.id, action, itemId, value),
    )
    setArtifact(result.artifact)
  }
  const askArtifact = async (itemId: string) => {
    const result = await unwrap<any>(
      service.artifactAskPrompt(artifact.id, itemId),
    )
    inputActions.setDraft(result.prompt)
    inputActions.submit()
    surface.setReading(false)
  }

  const close = () =>
    closePanel ? closePanel() : surface.dismiss(meta)
  if (!meta.cwd)
    return (
      <div style={{ padding: 20, color: colors.muted }}>{t.noWorkspace}</div>
    )
  const task = workspace.task
  const status = knowledgeState(workspace)
  const running = status.running
  const statusTitle = status.label
  const statusColor = status.color
  const knowledgeReady = Boolean(workspace.knowledgeReady)

  if (evidence)
    return (
      <section
        style={{
          height: '100%',
          display: 'grid',
          gridTemplateRows: '52px minmax(0,1fr)',
          background: colors.bg,
          color: colors.text,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 13px',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <button
            style={{ ...button, border: 0 }}
            onClick={() => setEvidence(null)}
          >
            ← {t.back}
          </button>
          <strong
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {evidence.heading || evidence.path}
          </strong>
          <button
            aria-label={t.close}
            style={{ ...button, marginLeft: 'auto', border: 0 }}
            onClick={close}
          >
            ×
          </button>
        </header>
        <div style={{ padding: 18, overflow: 'auto' }}>
          <div style={{ color: colors.muted, fontSize: 11 }}>
            {evidence.path} · {location(evidence)}
          </div>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, fontSize: 13 }}>
            {evidence.content}
          </p>
          {evidence.fresh === false && <p role="alert">原文件已经变化或不可用，以下是生成时的资料快照。</p>}
          {error && <p role="alert">{error}</p>}
          <button
            style={button}
            onClick={() => void run(() => openFile(workspace.path, evidence.path))}
          >
            {t.openSource}
          </button>
        </div>
      </section>
    )

  if (view==='wiki' || wikiPage) {
    const page=wiki?.pages?.find((item:any)=>item.id===wikiPage?.id)||wikiPage||wiki?.pages?.[0]
    return <><WikiReader {...{workspace,wiki,page,status,busy}} error={error||workspaceError}
      memory={surface.sessionState(sessionId)} remember={(patch:SessionMemory)=>remember({...patch,scrollPositions:patch.scrollPositions?{...surface.sessionState(sessionId).scrollPositions,...patch.scrollPositions}:surface.sessionState(sessionId).scrollPositions})}
      select={showWikiPage} back={()=>{if(closePanel)closePanel();else{setWikiPage(null);setView('home')}}}
      prepare={()=>{if(!workspace.consented)setConsent(true);else void run(async()=>{await unwrap(service.prepare(workspace.id,sessionId,false));await refresh()})}}
      cancel={()=>void run(async()=>{await unwrap(service.cancelTask(workspace.id));await refresh()})}
      askAI={(selected:any,text:string)=>{
        inputActions.setDraft(`${draft?draft+'\n\n':''}请结合工作区 Wiki「${selected.title}」讨论以下内容：\n${text||selected.content.slice(0,4000)}\n\n我的问题：`)
        surface.setReading(false)
      }}
      renderPage={(selected:any)=><Markdown page={selected} openEvidence={showEvidence}/>}/>
      {consent&&<KnowledgeConsentDialog workspace={workspace} busy={busy} close={()=>setConsent(false)} submit={()=>run(async()=>{await unwrap(service.prepare(workspace.id,sessionId,true));setConsent(false);await refresh()})}/>}
    </>
  }

  if (artifactId)
    return (
      <StudioArtifact artifact={artifact?.id===artifactId?artifact:null} back={()=>setArtifactId('')} close={close}
        showEvidence={showEvidence} askAI={askArtifact}
        exportFile={async(format:string)=>(await unwrap<any>(service.exportArtifact(artifactId,format))).file}
        manage={async(action:string,value:string)=>{
          if(action==='retry') {
            surface.setReading(false)
            const capability=workspace.capabilities.find((c:any)=>c.id===artifact.kind)
            surface.remember(sessionId,{awaitingArtifactSince:new Date().toISOString(),artifactId:''})
            inputActions.setDraft(artifactRequest(capability,artifact.parameters));inputActions.submit();return
          }
          const result=await unwrap<any>(service.manageArtifact(artifactId,action,value,sessionId))
          if(action==='delete')setArtifactId('');else setArtifact(result.artifact)
          await refresh()
        }}>
      <ArtifactPanel
        artifact={artifact}
        back={() => setArtifactId('')}
        close={close}
        update={updateArtifact}
        askAI={askArtifact}
        showEvidence={showEvidence}
      />
      </StudioArtifact>
    )

  return <>
    <WorkspaceHome {...{workspace,wiki,status,view,setView,expanded,setExpanded,query,setQuery,results,setResults,search,busy,refresh,showWikiPage,showEvidence,close}}
      scrollPositions={surface.sessionState(sessionId).scrollPositions}
      rememberScroll={(key:string,value:number)=>surface.remember(sessionId,{scrollPositions:{...surface.sessionState(sessionId).scrollPositions,[key]:value}})}
      error={error||workspaceError}
      prepare={()=>{if(!workspace.consented)setConsent(true);else void run(async()=>{await unwrap(service.prepare(workspace.id,sessionId,false));await refresh()})}}
      cancel={()=>void run(async()=>{await unwrap(service.cancelTask(workspace.id));await refresh()})}
      invoke={(capability:any)=>setDialog(capability)} openArtifact={setArtifactId}/>
    {dialog&&<ParameterDialog capability={dialog} busy={busy} close={()=>setDialog(null)} submit={(parameters:any)=>invoke(dialog,parameters)}/>}
    {consent&&<KnowledgeConsentDialog workspace={workspace} busy={busy} close={()=>setConsent(false)} submit={()=>run(async()=>{await unwrap(service.prepare(workspace.id, sessionId, true));setConsent(false);await refresh()})}/>}
  </>
}

function WelcomeStudioLauncher({
  session,
  useSession,
  useInput,
  inputActions,
  surface,
  service,
  sessionMeta,
  openFile,
}: any) {
  const sessionId = useSession((snapshot: any) => snapshot.sessionId)
  const meta = sessionMeta(sessionId)
  const { workspace, error: workspaceError, refresh } = useWorkspace(service, meta.cwd)
  const [dialog, setDialog] = useState<any>(null)
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState<any>(null)
  const [showKnowledge, setShowKnowledge] = useState(false)
  const reading:any=useSyncExternalStore(surface.subscribe,surface.getSnapshot,surface.getSnapshot)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (session?.blank !== true) {
      setDialog(null)
      setConsent(false)
      setPending(null)
      setShowKnowledge(false)
    }
  }, [session?.blank])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (cause: any) {
      setError(cause?.message || String(cause))
    } finally {
      setBusy(false)
    }
  }

  const invoke = async (capability: any, parameters: any = {}) => {
    if (capability.execution === 'conversation') {
      inputActions.setDraft(capability.prompt || BUILTIN_CAPABILITIES.find((item: any) => item.id === capability.id)?.prompt)
      inputActions.submit()
      return
    }
    if (capability.execution === 'artifact') {
      surface.setReading(false)
      surface.remember(sessionId, { awaitingArtifactSince: new Date().toISOString(), artifactId: '' })
      inputActions.setDraft(artifactRequest(capability, parameters))
      inputActions.submit()
      return
    }
    const target = workspace.id ? workspace : await workspaceRequest(service, meta.cwd)
    if (!target?.id) throw new Error(t.noWorkspace)
    const result = await unwrap<any>(
      service.invokeStudio(
        target.id,
        capability.id,
        parameters,
        sessionId,
      ),
    )
    if (result.action === 'compose') {
      inputActions.setDraft(result.prompt)
      inputActions.submit()
      return
    }
    if (result.action === 'artifact') {
      surface.remember(sessionId, { artifactId: result.artifact.id })
      surface.open(meta)
    }
  }

  const prepare = async (consent = false) => {
    await unwrap(service.prepare(workspace.id, sessionId, consent))
    setConsent(false)
  }

  const request = (capability: any, parameters: any = {}) => {
    setDialog(null)
    void run(() => invoke(capability, parameters))
  }

  if (session?.blank !== true || !meta.cwd) return null
  const status = knowledgeState(workspace)
  const progress = workspace.task?.total ? Math.min(100, workspace.task.processed / workspace.task.total * 100) : null
  const compactStatus = workspace.unknown ? status.label : status.running ? status.label
    : workspace.knowledgeReady
      ? zh
        ? '已就绪'
        : 'Ready'
      : workspace.task?.status === 'failed'
        ? t.failed
        : workspace.indexed || workspace.task
          ? zh
            ? '未完成'
            : 'Incomplete'
          : zh
            ? '尚未建立'
            : 'Not built'
  const capabilities = workspace.capabilities.filter(
    (capability: any) => capability.available,
  )
  return (
    <section
      data-knowledge-studio-welcome="true"
      style={{
        position: 'relative',
        width: '100%',
        padding: '12px 13px 13px',
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        background: colors.soft,
        color: colors.text,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 30,
          gap: 9,
          marginBottom: status.running ? 9 : 11,
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            display: 'grid',
            flex: '0 0 auto',
            placeItems: 'center',
            borderRadius: 9,
            background: colors.bg,
            color: colors.accent,
          }}
        >
          <KnowledgeIcon size={17} />
        </span>
        <strong style={{ fontSize: 13, lineHeight: 1.2 }}>{t.studio}</strong>
        <span
          data-knowledge-studio-status="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            color: status.color,
            fontSize: 11,
            lineHeight: 1.2,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: status.color,
            }}
          />
          {compactStatus}
        </span>
        <button
          type="button"
          disabled={busy || !workspace.id}
          onClick={() => {
            setShowKnowledge(value => !value)
            surface.setReading(!showKnowledge)
          }}
          style={{
            ...button,
            minHeight: 28,
            marginLeft: 'auto',
            padding: '3px 5px',
            border: 0,
            background: 'transparent',
            color: colors.accent,
            fontSize: 11,
          }}
        >
          {showKnowledge ? '收起知识' : '工作区知识'}{' '}
          →
        </button>
      </div>
      {status.running && progress != null && (
        <div
          style={{
            height: 3,
            margin: '-3px 0 11px 39px',
            overflow: 'hidden',
            borderRadius: 3,
            background: colors.border,
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: colors.accent,
            }}
          />
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 8,
        }}
      >
        {capabilities.map((capability: any) => (
          <button
            key={capability.id}
            type="button"
            data-knowledge-studio-capability={capability.id}
            disabled={busy}
            onClick={() =>
              capability.interaction === 'dialog'
                ? setDialog(capability)
                : request(capability)
            }
            title={capability.description}
            style={{
              ...button,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '8px 10px',
              textAlign: 'left',
              borderRadius: 10,
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                display: 'grid',
                flex: '0 0 auto',
                placeItems: 'center',
                borderRadius: 8,
                background: colors.soft,
                color: colors.accent,
              }}
            >
              <StudioIcon kind={capability.id} size={16} />
            </span>
            <strong style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {capability.title}
            </strong>
          </button>
        ))}
      </div>
      {pending && status.running && (
        <p style={{ margin: '9px 0 0', color: colors.muted, fontSize: 11 }}>
          {t.preparing}；完成后将自动继续“{pending.capability.title}”。
        </p>
      )}
      {showKnowledge && (
        <div
          role="region"
          aria-label={zh ? '工作区知识详情' : 'Workspace knowledge details'}
          style={{ marginTop: 12, height: 'min(400px,45vh)', overflow: 'hidden', border: `1px solid ${colors.border}`, borderRadius: 10 }}
        >
          <ReadingFrame expanded={reading.reading} target={reading.readingTarget} toggle={()=>surface.setReading(!reading.reading)}><DetailsPanel
            key={sessionId}
            initialView="wiki"
            {...{ useSession, useInput, inputActions, surface, service, sessionMeta, openFile }}
            closePanel={() => {setShowKnowledge(false);surface.setReading(false)}}
          /></ReadingFrame>
        </div>
      )}
      {workspaceError && <p role="alert">{workspaceError} <button style={button} onClick={refresh}>重试</button></p>}
      {error && (
        <p role="alert" style={{ margin: '9px 0 0', color: colors.red, fontSize: 11 }}>
          {t.error}：{error}
        </p>
      )}
      {dialog && (
        <ParameterDialog
          key={dialog.id}
          capability={dialog}
          busy={busy}
          close={() => setDialog(null)}
          submit={(parameters: any) => request(dialog, parameters)}
        />
      )}
      {consent && (
        <KnowledgeConsentDialog
          workspace={workspace}
          busy={busy}
          close={() => {
            setConsent(false)
            setPending(null)
          }}
          submit={() => run(() => prepare(true))}
        />
      )}
    </section>
  )
}

function SessionDetails(props: any) {
  const sessionId = props.useSession((value: any) => value.sessionId)
  const state:any=useSyncExternalStore(props.surface.subscribe,props.surface.getSnapshot,props.surface.getSnapshot)
  return <ReadingFrame expanded={Boolean(state.reading)} target={state.readingTarget} toggle={()=>props.surface.setReading(!state.reading)}><DetailsPanel key={sessionId} {...props} /></ReadingFrame>
}

function absoluteWorkspacePath(root: string, relative: string) {
  if (/^[A-Za-z]:[\\/]/.test(relative) || relative.startsWith('/'))
    return relative
  return `${String(root).replace(/[\\/]+$/, '')}/${String(relative).replace(/^[\\/]+/, '')}`
}

export async function apply(ctx: any) {
  const disposeRemote = await ctx.remote.$mount(knowledgeStudioRemote)
  ctx.inject(['remote.knowledgeStudio', 'remote.session'], (surfaceCtx: any) => {
    const service = surfaceCtx.remote.knowledgeStudio
    const surface = new KnowledgeSurface(surfaceCtx.layout)
    const sessionMeta = (sessionId: string): Target => {
      const state: any = useSyncExternalStore(surfaceCtx.sessions.list.subscribe, surfaceCtx.sessions.list.getSnapshot, surfaceCtx.sessions.list.getSnapshot)
      return { sessionId, cwd: state.byId[sessionId]?.cwd ?? '' }
    }
    const openFile = async (workspaceRoot: string, path: string) => {
      const result = await surfaceCtx.remote.session.openWorkspacePath({
        path: absoluteWorkspacePath(workspaceRoot, path),
      })
      if (!result?.ok)
        throw new Error(
          result?.error?.message || 'Failed to open workspace file',
        )
    }
    const disposers = [
      surfaceCtx.slots.inject('shell.overlay',()=>surfaceCtx.slots.register({name:'shell.overlay',id:'knowledge-studio-reader',order:0,inject:()=>({surface})},ReadingLayer)),
      surfaceCtx.slots.inject('conversation.session.header.actions', () =>
        surfaceCtx.slots.register(
          {
            name: 'conversation.session.header.actions',
            id: 'knowledge-studio',
            order: 30,
            inject: () => ({ surface, sessionMeta, service }),
          },
          HeaderAction,
        ),
      ),
      surfaceCtx.slots.inject('conversation.input.dock', () =>
        surfaceCtx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'knowledge-studio-welcome',
            order: -20,
            inject: () => ({
              surface,
              service,
              sessionMeta,
              openFile,
            }),
          },
          WelcomeStudioLauncher,
        ),
      ),
      surfaceCtx.slots.inject('details', () => {
        let disposeEntry: undefined | (() => void)
        const activation = {
          activate() {
            if (disposeEntry) return
            disposeEntry = surfaceCtx.slots.register(
              {
                name: 'details',
                priority: -50,
                inject: () => ({ surface, service, sessionMeta, openFile }),
              },
              SessionDetails,
            )
          },
          deactivate() {
            disposeEntry?.()
            disposeEntry = undefined
          },
        }
        surface.bind(activation)
        return () => {
          activation.deactivate()
          surface.bind(undefined)
        }
      }),
    ]
    let syncTimer: number | undefined
    let observedSessionState = ''
    const syncCurrentSession = () => {
      const state = surfaceCtx.sessions.list.getSnapshot()
      const current = state.current
      const summary = current ? state.byId[current] : undefined
      const key = `${current ?? ''}|${summary?.cwd ?? ''}|${summary?.blank ?? ''}`
      if (key === observedSessionState) return
      observedSessionState = key
      if (syncTimer !== undefined) window.clearTimeout(syncTimer)
      if (!current || !summary?.cwd || summary.blank !== false) {
        if (surface.getSnapshot().open || surface.getSnapshot().reading) surface.close()
        return
      }
      syncTimer = window.setTimeout(() => {
        const latest = surfaceCtx.sessions.list.getSnapshot()
        if (
          latest.current === current &&
          latest.byId[current]?.blank === false
        )
          surface.enter({ sessionId: current, cwd: latest.byId[current]?.cwd ?? '' })
      }, 16)
    }
    const disposeSessionSync = surfaceCtx.sessions.list.subscribe(
      syncCurrentSession,
    )
    disposers.push(() => {
      disposeSessionSync()
      if (syncTimer !== undefined) window.clearTimeout(syncTimer)
    })
    syncCurrentSession()
    surfaceCtx.effect(
      () => () => {
        surface.close()
        for (const dispose of disposers.reverse()) dispose?.()
      },
      'dsh-knowledge-studio: workspace details surface',
    )
  })
  return async () => {
    await disposeRemote()
  }
}
