import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { citationSnapshot, generateText } from './wiki.js'
import { basicEvidence, verifyBasicCitation } from './basic-evidence.js'
import { CONTENT_SCHEMAS, contentItems, validateContent } from './studio-content.js'
import { exportDocument, readExportFile } from './studio-export.js'
import { exportWithOfficeTools } from './office-tools.js'
import { renderMedia } from './studio-media.js'
import { videoPoster } from './video-poster.js'
import { normalizeMediaOptions } from './media-providers.js'

const VERSION = 1
const SUPPORTED_KINDS = new Set(['quiz', 'flashcards', ...Object.keys(CONTENT_SCHEMAS)])

function clone(value) { return structuredClone(value) }
function now() { return new Date().toISOString() }
function safeMessage(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .slice(0, 800)
}

function parseJSON(text) {
  const source = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const starts = ['{', '['].map(character => source.indexOf(character)).filter(index => index >= 0)
  if (!starts.length) throw new Error('The model did not return JSON')
  return JSON.parse(source.slice(Math.min(...starts)))
}

function emptyState() { return { version: VERSION, artifacts: [] } }
function normalizeState(value) {
  return { version: VERSION, artifacts: Array.isArray(value?.artifacts) ? value.artifacts : [] }
}

function summary(artifact) {
  const { content: _content, citations: _citations, interaction: _interaction, ...value } = artifact
  return value
}

export class ArtifactStore {
  #path
  #state = null
  #loading = null
  #tail = Promise.resolve()

  constructor(path = dshHomePath('plugins', 'dsh-knowledge-studio', 'artifacts.json')) {
    this.#path = path
  }

  async #write(state) {
    await mkdir(dirname(this.#path), { recursive: true })
    const temporary = `${this.#path}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.#path)
  }

  async #load() {
    if (this.#state) return this.#state
    if (!this.#loading) this.#loading = this.#readState().catch(error => { this.#loading = null; throw error })
    return this.#loading
  }

  async #readState() {
    try { this.#state = normalizeState(JSON.parse(await readFile(this.#path, 'utf8'))) }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error
      this.#state = emptyState()
    }
    let changed = false
    for (const artifact of this.#state.artifacts) {
      if (!['queued', 'running'].includes(artifact.status)) continue
      artifact.status = 'interrupted'
      artifact.phase = 'done'
      artifact.message = '上次进程在生成完成前退出，请重新生成。'
      artifact.updatedAt = now()
      changed = true
    }
    if (changed) await this.#write(this.#state)
    return this.#state
  }

  #mutate(operation) {
    const task = this.#tail.then(async () => {
      const state = await this.#load()
      const result = await operation(state)
      await this.#write(state)
      return clone(result)
    })
    this.#tail = task.catch(() => {})
    return task
  }

  create(workspace, kind, parameters, sessionId = null) {
    if (!SUPPORTED_KINDS.has(kind)) throw new Error(`Unsupported interactive artifact: ${kind}`)
    return this.#mutate(state => {
      const timestamp = now()
      const artifact = {
        id: `artifact_${randomUUID().replaceAll('-', '')}`, kind, workspaceId: String(workspace.id), workspaceTitle: workspace.title,
        sessionId,
        title: `${workspace.title} · ${{quiz:'测验',flashcards:'闪卡',report:'报告',mindmap:'思维导图',table:'数据表',slides:'演示文稿',audio:'音频概览',video:'视频概览'}[kind]}`, parameters,
        status: 'running', phase: 'retrieve', processed: 0, total: null, message: '',
        content: null, citations: [], interaction: {}, version: 1, createdAt: timestamp, updatedAt: timestamp,
      }
      state.artifacts.push(artifact)
      return artifact
    })
  }

  update(artifactId, patch) {
    return this.#mutate(state => {
      const artifact = state.artifacts.find(item => item.id === artifactId)
      if (!artifact) throw new Error(`Unknown Studio artifact: ${artifactId}`)
      Object.assign(artifact, patch, { id: artifact.id, workspaceId: artifact.workspaceId, updatedAt: now() })
      return artifact
    })
  }

  async read(artifactId) {
    const state = await this.#load()
    const artifact = state.artifacts.find(item => item.id === artifactId)
    if (!artifact) throw new Error(`Unknown Studio artifact: ${artifactId}`)
    return clone(artifact)
  }

  async list(workspaceId) {
    const state = await this.#load()
    return state.artifacts.filter(item => !item.deletedAt && item.workspaceId === String(workspaceId)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 100).map(item => clone(summary(item)))
  }

  interaction(artifactId, action, itemId, value) {
    return this.#mutate(state => {
      const artifact = state.artifacts.find(item => item.id === artifactId)
      if (!artifact) throw new Error(`Unknown Studio artifact: ${artifactId}`)
      if (artifact.status !== 'completed') throw new Error('Artifact generation is not complete')
      const length = artifact.kind === 'quiz' ? artifact.content?.questions?.length : artifact.content?.cards?.length
      const interaction = artifact.interaction && typeof artifact.interaction === 'object' ? artifact.interaction : {}
      if (action === 'reset') {
        artifact.interaction = artifact.kind === 'quiz' ? { current: 0, answers: {}, revealed: {} } : { current: 0, flipped: false, grades: {} }
      } else if (action === 'current') {
        artifact.interaction = { ...interaction, current: Math.max(0, Math.min(Math.max(0, Number(length) - 1), Number(value) || 0)), ...(artifact.kind === 'flashcards' ? { flipped: false } : {}) }
      } else if (artifact.kind === 'quiz' && action === 'answer') {
        artifact.interaction = { ...interaction, answers: { ...(interaction.answers ?? {}), [itemId]: Math.max(0, Number(value) || 0) } }
      } else if (artifact.kind === 'quiz' && action === 'reveal') {
        if (interaction.answers?.[itemId] == null) throw new Error('Choose an answer first')
        artifact.interaction = { ...interaction, revealed: { ...(interaction.revealed ?? {}), [itemId]: true } }
      } else if (artifact.kind === 'flashcards' && action === 'flip') {
        artifact.interaction = { ...interaction, flipped: Boolean(value) }
      } else if (artifact.kind === 'flashcards' && action === 'grade') {
        artifact.interaction = { ...interaction, flipped: false, grades: { ...(interaction.grades ?? {}), [itemId]: value === true } }
      } else throw new Error(`Unsupported artifact interaction: ${action}`)
      artifact.updatedAt = now()
      return artifact
    })
  }
}

function evidenceText(evidence) {
  return evidence.map(item => [
    `Evidence ID: ${item.evidenceId}`,
    `Source: ${item.path}`,
    `Location: ${item.locator === 'page' ? `pages ${item.pageStart}-${item.pageEnd}` : `lines ${item.lineStart}-${item.lineEnd}`}`,
    `Heading: ${item.heading ?? ''}`,
    String(item.content ?? '').slice(0, 1600),
  ].join('\n')).join('\n\n---\n\n').slice(0, 56_000)
}

function normalizeParameters(kind, value = {}) {
  const focus = String(value.focus ?? '').trim().slice(0, 500)
  const pathPrefix = String(value.pathPrefix ?? '').replaceAll('\\','/').replace(/^\.\//,'').replace(/\/$/,'')
  if (pathPrefix.startsWith('/') || /^[A-Za-z]:/.test(pathPrefix) || pathPrefix.split('/').includes('..')) throw new Error('资料范围必须是工作区内的相对路径')
  const shared = { focus, language:String(value.language || 'zh-CN').slice(0,50), audience:String(value.audience || '').slice(0,200), ...(pathPrefix ? {pathPrefix} : {}), ...(['audio','video'].includes(kind)?normalizeMediaOptions(value):{}) }
  if (CONTENT_SCHEMAS[kind]) return { ...shared, count:Math.max(2,Math.min(20,Number(value.count)||6)), template:String(value.template||'briefing').slice(0,80), columns:String(value.columns||'').slice(0,500), style:['dialogue','critique','debate'].includes(value.style)?value.style:'narration',delivery:value.delivery==='reading'?'reading':'presentation' }
  if (kind === 'quiz') {
    const count = [5, 8, 12].includes(Number(value.count)) ? Number(value.count) : 8
    const difficulty = ['easy', 'medium', 'hard'].includes(value.difficulty) ? value.difficulty : 'medium'
    return { count, difficulty, ...shared }
  }
  const count = [8, 15, 24].includes(Number(value.count)) ? Number(value.count) : 15
  return { count, difficulty:['easy','medium','hard'].includes(value.difficulty)?value.difficulty:'medium', ...shared }
}

function validateQuiz(text, evidence, requested) {
  const parsed = parseJSON(text)
  const allowed = new Set(evidence.map(item => item.evidenceId))
  const questions = []
  for (const item of Array.isArray(parsed.questions) ? parsed.questions : []) {
    const options = Array.isArray(item?.options) ? item.options.map(option => String(option).trim().slice(0, 400)).filter(Boolean).slice(0, 6) : []
    const correctIndex = Number(item?.correctIndex)
    const evidenceIds = [...new Set(Array.isArray(item?.evidenceIds) ? item.evidenceIds.filter(id => allowed.has(id)) : [])]
    if (!String(item?.question ?? '').trim() || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length || !evidenceIds.length) continue
    questions.push({ id: `q${questions.length + 1}`, question: String(item.question).trim().slice(0, 800), options, correctIndex, explanation: String(item.explanation ?? '').trim().slice(0, 1200), evidenceIds })
    if (questions.length >= requested) break
  }
  if (questions.length < requested) throw new Error(`模型只返回 ${questions.length}/${requested} 道有效题目，请保留原参数重试`)
  return { title: String(parsed.title ?? '工作区测验').trim().slice(0, 120) || '工作区测验', questions }
}

function validateFlashcards(text, evidence, requested) {
  const parsed = parseJSON(text)
  const allowed = new Set(evidence.map(item => item.evidenceId))
  const cards = []
  for (const item of Array.isArray(parsed.cards) ? parsed.cards : []) {
    const evidenceIds = [...new Set(Array.isArray(item?.evidenceIds) ? item.evidenceIds.filter(id => allowed.has(id)) : [])]
    if (!String(item?.front ?? '').trim() || !String(item?.back ?? '').trim() || !evidenceIds.length) continue
    cards.push({ id: `card${cards.length + 1}`, front: String(item.front).trim().slice(0, 700), back: String(item.back).trim().slice(0, 1400), evidenceIds })
    if (cards.length >= requested) break
  }
  if (cards.length < requested) throw new Error(`模型只返回 ${cards.length}/${requested} 张有效闪卡，请保留原参数重试`)
  return { title: String(parsed.title ?? '工作区抽认卡').trim().slice(0, 120) || '工作区抽认卡', cards }
}

export class ArtifactEngine {
  #ctx
  #manager
  #store
  #outputRoot
  #tasks = new Map()
  #mediaProviders

  constructor(ctx, manager, { artifactPath, mediaProviders } = {}) {
    this.#ctx = ctx
    this.#manager = manager
    this.#mediaProviders = mediaProviders
    this.#store = new ArtifactStore(artifactPath)
    this.#outputRoot = join(artifactPath ? dirname(artifactPath) : dshHomePath('plugins','dsh-knowledge-studio'), 'exports')
  }

  list(workspaceId) { return this.#store.list(workspaceId) }
  async read(artifactId) {
    const artifact = await this.#store.read(artifactId)
    const workspace = this.#ctx.workspaceRegistry.get(artifact.workspaceId)
    if (!workspace || !artifact.citations?.length) return artifact
    const citations = []
    for (const citation of artifact.citations) {
      if (citation.evidenceId.startsWith('file_')) {
        citations.push({ ...citation, fresh: await verifyBasicCitation(this.#ctx.fs, workspace, citation) })
        continue
      }
      const current = await this.#manager.readEvidence(workspace, citation.evidenceId)
      citations.push({ ...citation, fresh: Boolean(current && current.revisionHash === citation.revisionHash && current.excerptHash === citation.excerptHash) })
    }
    return { ...artifact, citations }
  }
  interaction(artifactId, action, itemId, value) { return this.#store.interaction(artifactId, action, itemId, value) }
  async manage(artifactId, action, value, sessionId) {
    const artifact = await this.#store.read(artifactId)
    if (action === 'cancel') { this.#tasks.get(artifactId)?.controller.abort(new Error('用户取消生成')); return this.wait(artifactId) }
    if (action === 'rename') {
      const title=String(value||'').trim().slice(0,150); if(!title)throw new Error('名称不能为空')
      return this.#store.update(artifactId,{title})
    }
    if (action === 'delete') {
      this.#tasks.get(artifactId)?.controller.abort(new Error('用户移除成果'))
      await this.wait(artifactId)
      return this.#store.update(artifactId,{deletedAt:now()})
    }
    if (action === 'retry') {
      if(this.#tasks.has(artifactId))throw new Error('成果仍在生成')
      const workspace=this.#ctx.workspaceRegistry.get(artifact.workspaceId)
      if(!workspace)throw new Error('原工作区不可用')
      return this.start(workspace,artifact.kind,artifact.parameters,sessionId || artifact.sessionId)
    }
    throw new Error('未知成果操作')
  }
  async export(artifactId,format) {
    const artifact=await this.#store.read(artifactId)
    if(!artifact.content)throw new Error('成果尚未生成内容')
    let file=artifact.exports?.find(item=>item.format===format)
    if(format==='poster'&&artifact.kind==='video') {
      const video=artifact.exports?.find(item=>item.format==='mp4')
      if(!video)throw new Error('视频尚未生成')
      file=await videoPoster(video)
    }
    if(!file)file=await exportDocument(artifact,join(this.#outputRoot,artifactId),format)
    return readExportFile({...file,fileName:`${artifact.title.replace(/[<>:\x22/\\|?*\x00-\x1f]/g,'_').slice(0,100).replace(/[. ]+$/,'')||artifact.id}.${format}`})
  }
  async wait(artifactId) {
    const task = this.#tasks.get(artifactId)
    if (task) await task.promise
    return this.read(artifactId)
  }

  async start(workspace, kind, parameters, sessionId, signal, execution) {
    const normalized = normalizeParameters(kind, parameters)
    const artifact = await this.#store.create(workspace, kind, normalized, sessionId)
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason ?? new Error('Studio generation cancelled'))
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    const promise = this.#run(artifact, workspace, sessionId, controller.signal, execution).finally(() => {
      signal?.removeEventListener('abort', abort)
      this.#tasks.delete(artifact.id)
    })
    this.#tasks.set(artifact.id, { controller, promise })
    void promise
    return artifact
  }

  async #run(artifact, workspace, sessionId, signal, execution) {
    try {
      const focus = artifact.parameters.focus
      const query = focus || (artifact.kind === 'quiz' ? '核心概念 关键事实 原理 方法 注意事项' : '核心概念 定义 原理 要点 方法')
      const status = this.#manager.status ? await this.#manager.status(workspace) : { indexed: true }
      const task = this.#manager.task?.(workspace.id)
      const useIndex = status.indexed && !['scan', 'write'].includes(task?.phase)
      let evidence
      if (useIndex) {
        evidence = (await this.#manager.searchDetailed(workspace, query, { limit: Math.min(40, artifact.parameters.count * 3), pathPrefix:artifact.parameters.pathPrefix, signal })).results
        if (evidence.length < 4 && !artifact.parameters.pathPrefix) evidence = await this.#manager.sample(workspace, Math.min(40, artifact.parameters.count * 3))
      } else {
        evidence = await basicEvidence(this.#ctx.fs, workspace, query, { signal, pathPrefix:artifact.parameters.pathPrefix, limit: Math.min(40, artifact.parameters.count * 3) })
      }
      await this.#store.update(artifact.id, { sourceMode: useIndex ? 'index' : 'files', sourceScope: `${useIndex ? '本地索引检索' : '按本次读取的资料生成，最多读取 48 个文件，不代表覆盖整个工作区'} · ${evidence.length} 条来源片段${artifact.parameters.pathPrefix ? ' · 范围：'+artifact.parameters.pathPrefix : ''}` })
      evidence = evidence.filter(item => item.evidenceId).slice(0, 40)
      if (!evidence.length) throw new Error('当前工作区没有足够的可引用内容')
      await this.#store.update(artifact.id, { phase: 'generate', processed: 1, total: 2 })
      const common = `输出语言：${artifact.parameters.language}。受众：${artifact.parameters.audience || '一般读者'}。难度：${artifact.parameters.difficulty || '适中'}。主题偏好：${focus || '覆盖工作区最重要的内容'}\n\nEvidence Bundle：\n${evidenceText(evidence)}`
      let generated
      if (artifact.kind === 'quiz') {
        const difficulty = { easy: '基础', medium: '中等', hard: '进阶' }[artifact.parameters.difficulty]
        const result = await generateText(this.#ctx, {
          sessionId, signal, maxTokens: 12000, boundedReasoning:true, purpose: 'knowledge-studio-quiz',
          system: '你是严谨的学习测验编辑。只能使用 Evidence Bundle，不得编造事实或引用。干扰项应可信但可由证据明确排除。只输出严格 JSON，不调用工具。',
          prompt: `生成 ${artifact.parameters.count} 道${difficulty}难度的单选题。题目覆盖不同知识点，避免仅考文件名或无意义细节。${common}\n\n输出：{"title":"测验标题","questions":[{"question":"题干","options":["选项A","选项B","选项C","选项D"],"correctIndex":0,"explanation":"基于证据的解释","evidenceIds":["真实 Evidence ID"]}]}。correctIndex 从 0 开始；每题至少一个真实 Evidence ID。`,
        })
        generated = validateQuiz(result.text, evidence, artifact.parameters.count)
      } else if (artifact.kind === 'flashcards') {
        const result = await generateText(this.#ctx, {
          sessionId, signal, maxTokens: 12000, boundedReasoning:true, purpose: 'knowledge-studio-flashcards',
          system: '你是严谨的学习卡片编辑。只能使用 Evidence Bundle，不得编造事实或引用。卡片正面应提出一个清晰问题，背面给出简洁且充分的答案。只输出严格 JSON，不调用工具。',
          prompt: `生成 ${artifact.parameters.count} 张抽认卡，覆盖不同知识点。${common}\n\n输出：{"title":"卡片标题","cards":[{"front":"正面问题","back":"背面答案","evidenceIds":["真实 Evidence ID"]}]}。每张卡至少一个真实 Evidence ID。`,
        })
        generated = validateFlashcards(result.text, evidence, artifact.parameters.count)
      } else {
        const result=await generateText(this.#ctx,{
          sessionId,signal,maxTokens:12000,purpose:`knowledge-studio-${artifact.kind}`,
          system:'你是资料驱动的内容编辑。只依据提供的来源，缺失信息明确说明。输出严格 JSON，每项必须引用真实 Evidence ID。不得执行或输出可执行代码。',
          prompt:`生成 ${artifact.kind}。参数：${JSON.stringify(artifact.parameters)}。报告至少 3 个小节，导图用树形父子节点。音视频使用简洁口语；视频每场景只表达一个重点、每条屏显要点少于30字，配音不少于2句。演示文稿每页最多4条要点，附讲稿。表格按用户字段组织。\n${common}\n输出格式：${CONTENT_SCHEMAS[artifact.kind]}`,
        })
        generated=validateContent(artifact.kind,result.text,evidence)
      }
      const used = new Set(contentItems(generated).flatMap(item => item.evidenceIds))
      const citations = []
      for (const item of evidence.filter(value => used.has(value.evidenceId))) {
        const current = item.evidenceId.startsWith('file_') ? item : await this.#manager.readEvidence(workspace, item.evidenceId)
        if (current) citations.push(citationSnapshot(current))
      }
      const interaction = artifact.kind === 'quiz' ? { current: 0, answers: {}, revealed: {} } : { current: 0, flipped: false, grades: {} }
      const ready={...artifact,title:generated.title,content:generated,citations,interaction}
      await this.#store.update(artifact.id,{...ready,phase:'export'})
      const exports=[]
      if(['audio','video'].includes(artifact.kind)) {
        const media=await renderMedia(ready,join(this.#outputRoot,artifact.id),signal,message=>{void this.#store.update(artifact.id,{phase:'render',message})},this.#mediaProviders,{sessionId,workspace,execution})
        const {attachments=[],...file}=media
        exports.push(file,...attachments)
      }
      const officeFormat={report:'docx',slides:'pptx',table:'xlsx'}[artifact.kind]
      if(officeFormat) {
        const directory=join(this.#outputRoot,artifact.id)
        exports.push(await exportWithOfficeTools(this.#ctx,ready,directory,officeFormat,{execution,signal}) || await exportDocument(ready,directory,officeFormat))
      }
      signal.throwIfAborted()
      await this.#store.update(artifact.id, { status: 'completed', phase: 'done', processed: 2, total: 2, exports, message: '' })
    } catch (error) {
      await this.#store.update(artifact.id, { status: signal.aborted ? 'cancelled' : 'failed', phase: 'done', message: safeMessage(error) }).catch(() => {})
    }
  }

  async askPrompt(artifactId, itemId) {
    const artifact = await this.read(artifactId)
    if (!['quiz','flashcards'].includes(artifact.kind)) return `请基于当前工作区，继续讨论或按我的要求修改 Studio 成果 ${artifact.id}（${artifact.title}），条目 ${itemId || '全部'}。内容：${JSON.stringify(artifact.content).slice(0,20000)}。保留来源依据；需要新版本时调用 knowledge_studio_create_artifact。`
    const items = artifact.kind === 'quiz' ? artifact.content?.questions : artifact.content?.cards
    const item = items?.find(value => value.id === itemId)
    if (!item) throw new Error(`Unknown artifact item: ${itemId}`)
    const citations = artifact.citations.filter(citation => item.evidenceIds.includes(citation.evidenceId))
    const subject = artifact.kind === 'quiz'
      ? `题目：${item.question}\n选项：${item.options.map((value, index) => `${String.fromCharCode(65 + index)}. ${value}`).join('\n')}\n已有解释：${item.explanation}`
      : `卡片正面：${item.front}\n卡片背面：${item.back}`
    const sources = citations.map(citation => `${citation.path}（${citation.locator === 'page' ? `第 ${citation.pageStart} 页` : `第 ${citation.lineStart}-${citation.lineEnd} 行`}）`).join('；')
    const choice = artifact.interaction?.answers?.[itemId]
    const identity = `成果：${artifact.id}；条目：${itemId}；我的选择：${choice == null ? '尚未选择' : String.fromCharCode(65 + choice)}`
    return `${identity}\n\n请结合当前工作区，进一步解释下面这项学习内容，并指出容易误解之处。\n\n${subject}\n\n可核验来源：${sources}`
  }

  async close() {
    for (const task of this.#tasks.values()) task.controller.abort(new Error('Knowledge Studio is stopping'))
    await Promise.allSettled([...this.#tasks.values()].map(task => task.promise))
    this.#tasks.clear()
  }
}

export { normalizeParameters, validateFlashcards, validateQuiz }
