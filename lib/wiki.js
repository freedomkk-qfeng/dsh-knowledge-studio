import { createHash } from 'node:crypto'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'

function diagnostic(error) {
  return String(error?.message ?? error).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/https?:\/\/\S+/g, '[endpoint]').slice(0, 800)
}

const PROFILE_PAGES = Object.freeze({
  general: [
    ['overview', '项目概览', '项目目标、范围、核心内容和主要入口', 'high', ''],
    ['structure', '内容结构', '目录、资料分类与各部分之间的关系', 'high', '资料结构'],
    ['assets', '核心资产', '最重要的文件、文档、数据和交付物', 'high', '资料结构'],
    ['key-concepts', '关键概念', '工作区中反复出现的概念、术语与约定', 'normal', '资料结构'],
    ['workflows', '主要流程', '关键任务、业务流程或使用路径', 'high', '使用与协作'],
    ['roles', '角色与协作', '参与者、职责边界和协作关系', 'normal', '使用与协作'],
    ['inputs-outputs', '输入与输出', '主要输入、处理过程和结果产物', 'normal', '使用与协作'],
    ['getting-started', '快速开始', '如何理解和使用该工作区中的核心资产', 'normal', '使用与协作'],
    ['maintenance', '维护与更新', '资料如何维护、更新和保持一致', 'normal', '维护指南'],
    ['risks', '限制与注意事项', '当前边界、风险和使用注意事项', 'normal', '维护指南'],
  ],
  code: [
    ['overview', '项目概览', '项目用途、技术边界、运行入口与主要能力', 'high', ''],
    ['architecture', '架构概览', '总体组件、技术分层和关键边界', 'high', '架构设计'],
    ['layers', '分层设计', '各层职责、依赖方向和隔离边界', 'high', '架构设计'],
    ['modules', '核心模块', '重要目录、模块、类和函数的职责', 'high', '架构设计'],
    ['dependencies', '依赖与运行时', '内部依赖、第三方依赖和运行时组成', 'normal', '架构设计'],
    ['data-model', '数据模型', '核心实体、数据结构和持久化模型', 'high', '数据与流程'],
    ['data-flow', '数据与控制流', '请求、数据、事件或任务如何在系统中流动', 'high', '数据与流程'],
    ['state-storage', '状态与存储', '状态管理、缓存、数据库和文件存储', 'normal', '数据与流程'],
    ['interfaces', '接口与协议', '内部接口、外部 API、消息和协议约定', 'high', '接口与集成'],
    ['extensions', '扩展机制', '插件、适配器、Hook 和其他扩展点', 'normal', '接口与集成'],
    ['security-config', '配置与安全边界', '配置来源、凭据、权限和信任边界', 'normal', '接口与集成'],
    ['getting-started', '快速开始', '安装依赖、首次运行和最短验证路径', 'high', '工程指南'],
    ['development', '开发与构建', '本地开发、构建命令和代码组织约定', 'normal', '工程指南'],
    ['testing', '测试与质量保障', '测试分层、质量门禁和验收方式', 'normal', '工程指南'],
    ['deployment', '部署与运维', '打包、发布、部署、升级和运行维护', 'normal', '工程指南'],
    ['troubleshooting', '故障排查', '常见问题、诊断入口和恢复方式', 'normal', '工程指南'],
  ],
  research: [
    ['overview', '研究概览', '研究问题、背景、贡献与材料范围', 'high', ''],
    ['questions', '研究问题', '核心问题、研究目标和待验证假设', 'high', '研究设计'],
    ['framework', '理论与分析框架', '核心概念、理论依据和分析框架', 'normal', '研究设计'],
    ['methods', '研究方法', '方法设计、模型和分析路径', 'high', '方法与数据'],
    ['data', '数据与样本', '数据来源、样本、变量和预处理', 'high', '方法与数据'],
    ['experiments', '实验设置', '实验环境、对照、指标和实现细节', 'high', '方法与数据'],
    ['findings', '主要发现', '结果、证据和解释', 'high', '结果与讨论'],
    ['robustness', '稳健性与补充分析', '稳健性检查、消融和补充实验', 'normal', '结果与讨论'],
    ['limitations', '边界与局限', '适用范围、局限和可能偏差', 'normal', '结果与讨论'],
    ['reproducibility', '复现指南', '环境、数据、代码和复现实验步骤', 'normal', '研究资料'],
    ['references', '资料与引用', '论文、参考文献、附录和相关材料入口', 'normal', '研究资料'],
    ['glossary', '术语表', '重要术语、缩写和口径', 'normal', '研究资料'],
  ],
  policy: [
    ['overview', '制度概览', '制度目的、适用范围、依据和总体要求', 'high', ''],
    ['scope', '适用范围', '适用对象、业务边界和例外情况', 'high', '制度框架'],
    ['principles', '基本原则', '制度遵循的原则、价值和治理要求', 'normal', '制度框架'],
    ['roles', '角色与职责', '组织、岗位和参与方的职责边界', 'high', '组织与职责'],
    ['coordination', '协同机制', '跨部门协同、决策和沟通机制', 'normal', '组织与职责'],
    ['process', '办理与治理流程', '关键步骤、触发条件、输入输出和例外处理', 'high', '流程与标准'],
    ['standards', '标准与要求', '必须遵循的规则、口径、分类和质量要求', 'high', '流程与标准'],
    ['exceptions', '例外与变更', '例外审批、制度变更和版本衔接', 'normal', '流程与标准'],
    ['compliance', '监督与合规', '检查、审计、风险和责任机制', 'high', '监督与实施'],
    ['assessment', '评价与改进', '评价指标、反馈和持续改进机制', 'normal', '监督与实施'],
    ['implementation', '实施指南', '落地步骤、配套材料和执行入口', 'normal', '监督与实施'],
    ['glossary', '术语与口径', '制度中的重要术语、定义和口径', 'normal', '附录'],
  ],
})

function slug(value, fallback) {
  const normalized = String(value ?? '').toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '')
  return (normalized || fallback).slice(0, 64)
}

function parseJSON(text) {
  const source = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = Math.min(...['{', '['].map(character => source.indexOf(character)).filter(index => index >= 0))
  if (!Number.isFinite(start)) throw new Error('The model did not return JSON')
  return JSON.parse(source.slice(start))
}

function inferProfile(files) {
  if (files.some(file => ['tex', 'bib', 'pdf'].includes(file.kind))) return 'research'
  if (files.some(file => ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'cs', 'php', 'rb', 'swift'].includes(file.kind))) return 'code'
  if (files.some(file => /制度|办法|规定|标准|规范|policy|governance/i.test(file.path))) return 'policy'
  return 'general'
}

function deterministicPlan(profile) {
  return PROFILE_PAGES[profile].map(([pageSlug, title, description, importance, chapter], index) => ({
    slug: pageSlug, title, description, importance, chapter,
    related: index === 0 ? PROFILE_PAGES[profile].filter((page, pageIndex) => pageIndex > 0 && page[4] !== PROFILE_PAGES[profile][pageIndex - 1]?.[4]).slice(0, 5).map(page => page[0]) : ['overview'],
  }))
}

function compactFileTree(files) {
  return files.slice(0, 500).map(file => `${file.path} (${file.kind}, ${file.size} bytes)`).join('\n').slice(0, 24_000)
}

function modelSelection(ctx, sessionId) {
  const agent = sessionId ? ctx.agents?.get(sessionId) : null
  const request = agent?.session?.requestHeader()?.config
  const fallback = ctx.agentDefaultModel?.currentSelection?.()
  const provider = request?.provider ?? fallback?.provider
  const model = request?.model ?? fallback?.model
  return provider && model ? { provider, model } : null
}

async function generateText(ctx, { sessionId, system, prompt, signal, maxTokens = 2400, purpose = 'knowledge-studio', boundedReasoning = false }) {
  const selection = modelSelection(ctx, sessionId)
  if (!selection || !ctx.llm?.stream) throw new Error('No DSH model is available for Studio generation')
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason ?? new Error('Studio generation cancelled'))
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('Studio model request timed out')), 3 * 60_000)
  try {
    // Short Wiki pages must reserve their output budget for visible text. Only
    // select efforts advertised by this exact route; other Studio calls retain
    // the provider defaults, and adapters without metadata remain compatible.
    let reasoning = {}
    if (boundedReasoning && ctx.llm.resolveModelInfo) {
      const info = await ctx.llm.resolveModelInfo(selection.provider, selection.model, controller.signal)
      const supported = new Set(info?.reasoning?.efforts?.map(effort => effort.id) || [])
      const effort = ['low', 'medium', 'off'].find(value => supported.has(value))
      if (effort) reasoning = { reasoningEffort: effort }
    }
    const assembler = new BlockAssembler()
    const messages = [createUserMessage({
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'plugin', plugin: 'dsh-knowledge-studio' },
    })]
    for await (const chunk of ctx.llm.stream({ ...selection, ...reasoning, messages, system, maxTokens, sessionId, purpose, signal: controller.signal })) assembler.push(chunk)
    controller.signal.throwIfAborted()
    const finish = assembler.finish
    if (['error', 'aborted'].includes(finish?.kind)) throw new Error(`Studio model failed: ${diagnostic(finish.failure?.message ?? finish.failure ?? finish.kind)}`)
    if (finish?.kind === 'max-tokens') throw new Error(`模型输出达到长度上限 ${maxTokens}，请缩小资料范围后重试`)
    const blocks = assembler.blocks()
    if (blocks.some(block => block.type === 'tool-call')) throw new Error('Studio generation must return text only')
    const text = blocks.filter(block => block.type === 'text').map(block => block.text).join('\n').trim()
    if (!text) throw new Error(`The model returned an empty Studio response (finish: ${finish?.kind ?? 'unknown'}, maxTokens: ${maxTokens})`)
    return { text, selection }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

async function planWithModel(ctx, { files, profile, sessionId, signal }) {
  const deterministic = deterministicPlan(profile)
  const pageRange = files.length >= 150 ? '12 至 18' : files.length >= 50 ? '10 至 15' : '8 至 12'
  const { text } = await generateText(ctx, {
    sessionId, signal, maxTokens: 8000,
    system: '你是 Workspace Wiki 的信息架构师。只能根据提供的文件清单规划页面，不得声称看过未提供的内容。目录必须形成清晰章节，而不是几个宽泛的大页面。只输出严格 JSON。',
    prompt: `为下面的工作区规划 ${pageRange} 个 Wiki 页面，组织为 3 至 6 个章节，每章 2 至 5 页。当前资料类型为 ${profile}。页面标题应具体、可直接回答一个主题，避免“其他”“综合说明”等空泛标题。\n\n文件清单：\n${compactFileTree(files)}\n\n输出格式：{"pages":[{"slug":"英文或简短稳定标识","title":"中文标题","chapter":"所属章节；项目总览页可为空","description":"该页应回答的问题","importance":"high|normal","related":["其他 slug"]}]}。`,
  })
  const parsed = parseJSON(text)
  if (!Array.isArray(parsed.pages) || parsed.pages.length < 6 || parsed.pages.length > 24) throw new Error('Invalid Wiki page plan')
  const seen = new Set()
  const pages = parsed.pages.map((page, index) => {
    const pageSlug = slug(page.slug ?? page.title, `page-${index + 1}`)
    if (!page.title || seen.has(pageSlug)) throw new Error('Wiki page plan contains a missing title or duplicate slug')
    seen.add(pageSlug)
    return { slug: pageSlug, title: String(page.title).slice(0, 100), chapter: String(page.chapter ?? '').trim().slice(0, 80), description: String(page.description ?? page.title).slice(0, 500), importance: page.importance === 'high' ? 'high' : 'normal', related: Array.isArray(page.related) ? page.related.map(value => slug(value, '')).filter(Boolean).slice(0, 6) : [] }
  })
  return pages.length ? pages : deterministic
}

function citationSnapshot(evidence) {
  return {
    evidenceId: evidence.evidenceId,
    chunkId: evidence.chunkId,
    path: evidence.path,
    heading: evidence.heading,
    locator: evidence.locator,
    pageStart: evidence.pageStart,
    pageEnd: evidence.pageEnd,
    lineStart: evidence.lineStart,
    lineEnd: evidence.lineEnd,
    excerpt: evidence.content.slice(0, 500),
    excerptHash: evidence.excerptHash,
    revisionHash: evidence.revisionHash,
    fresh: true,
  }
}

function fallbackPage(page, evidence) {
  const selected = evidence.slice(0, 8)
  const intro = selected.length
    ? `本页依据工作区中的 ${selected.length} 条可核验资料，整理“${page.title}”相关内容。`
    : `当前索引中没有足够资料支撑“${page.title}”页面，建议补充相关文件后重新生成。`
  const sections = selected.map(item => `### ${item.heading || item.path}\n\n${item.content.slice(0, 700).trim()}\n\n[^${item.evidenceId}]`).join('\n\n')
  return { summary: intro, content: `# ${page.title}${sections ? `\n\n${sections}` : ''}`, usedEvidenceIds: selected.map(item => item.evidenceId) }
}

async function pageWithModel(ctx, { page, evidence, sessionId, signal }) {
  if (evidence.length === 0) throw new Error('没有足够来源支撑此页面，请补充资料后重试')
  const evidenceText = evidence.map(item => [
    `Evidence ID: ${item.evidenceId}`,
    `Source: ${item.path} (${item.locator === 'page' ? `pages ${item.pageStart}-${item.pageEnd}` : `lines ${item.lineStart}-${item.lineEnd}`})`,
    `Heading: ${item.heading}`,
    item.content.slice(0, 1600),
  ].join('\n')).join('\n\n---\n\n').slice(0, 48_000)
  const { text } = await generateText(ctx, {
    sessionId, signal, maxTokens: 12000, boundedReasoning: true,
    system: '你是严谨的 Workspace Wiki 编辑。所有事实只能来自 Evidence Bundle。不得编造文件、接口、结论或引用。正文应像成熟技术 Wiki：先解释再列细节，使用清晰小节、有效 GFM 表格和列表，不得整段照抄原始资料。单页聚焦当前主题，最多 6 个 blocks，正文以 600 至 1200 汉字为宜；资料不足时更短，不为凑篇幅重复其他页面。只输出严格 JSON。',
    prompt: `撰写 Wiki 页面“${page.title}”。所属章节：${page.chapter || '项目总览'}。目标：${page.description}\n\nEvidence Bundle：\n${evidenceText}\n\n输出格式：{"summary":"一句摘要","blocks":[{"markdown":"一段或一个小节的 Markdown，不含脚注定义","evidenceIds":["支撑该段的 Evidence ID"]}]}。每个事实段必须列出至少一个真实 Evidence ID；无法支撑的内容不要写。表格必须包含合法的 GFM 表头分隔行；代码、文件名和符号使用 Markdown code；不要输出页面一级标题。`,
  })
  const parsed = parseJSON(text)
  if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.blocks)) throw new Error('Invalid Wiki page response')
  const allowed = new Set(evidence.map(item => item.evidenceId))
  const used = new Set()
  const blocks = []
  for (const block of parsed.blocks) {
    if (typeof block?.markdown !== 'string') continue
    const ids = Array.isArray(block.evidenceIds) ? block.evidenceIds.filter(id => allowed.has(id)) : []
    if (ids.length === 0) continue
    ids.forEach(id => used.add(id))
    blocks.push(`${block.markdown.trim()}\n\n${ids.map(id => `[^${id}]`).join(' ')}`)
  }
  if (blocks.length === 0) throw new Error('The model produced no evidence-backed Wiki blocks')
  return { summary: parsed.summary.trim().slice(0, 600), content: `# ${page.title}\n\n${blocks.join('\n\n')}`, usedEvidenceIds: [...used] }
}

export class WikiGenerator {
  #ctx
  #search

  constructor(ctx, search) {
    this.#ctx = ctx
    this.#search = search
  }

  async generate(store, workspace, { sessionId, profile = 'auto', signal, onProgress } = {}) {
    const files = await store.fileOverview()
    const effectiveProfile = profile === 'auto' ? inferProfile(files) : profile
    const sourceFingerprint = await store.sourceFingerprint()
    const selection = modelSelection(this.#ctx, sessionId)
    if (!selection) throw new Error('当前没有可用模型；资料索引已保留，请选择模型后重试 Wiki')
    const previous = await store.wikiSnapshot()
    const reusable = previous?.sourceFingerprint === sourceFingerprint
    const successful = page => page.status === 'completed' && !/^> 资料概览（降级）/.test(page.content || '')
    if (reusable && previous.status === 'published' && previous.pages.every(successful)) {
      return { editionId: previous.id, profile: effectiveProfile, pages: previous.pages.length, completed: previous.pages.length, failed: 0, sourceFingerprint, reused: true }
    }
    let pages = deterministicPlan(effectiveProfile)
    onProgress?.({ phase: 'wiki-plan', processed: 0, total: null, path: null })
    if (reusable) pages = previous.pages.map(page => ({ ...page, description: page.title }))
    else if (selection && files.length > 0) {
      try { pages = await planWithModel(this.#ctx, { files, profile: effectiveProfile, sessionId, signal }) } catch {}
    }
    const edition = reusable ? previous : await store.createWikiEdition({
      workspaceId: String(workspace.id), profile: effectiveProfile, title: workspace.title,
      sourceFingerprint, provider: selection?.provider ?? '', model: selection?.model ?? '', pages,
    })
    onProgress?.({ phase: 'wiki-plan', processed: pages.length, total: pages.length, path: pages[0]?.title ?? null })
    const seedChunks = await store.chunks()
    let completed = reusable ? edition.pages.filter(successful).length : 0
    try {
      for (let index = 0; index < edition.pages.length; index += 1) {
        if (signal?.aborted) throw signal.reason ?? new Error('Wiki generation cancelled')
        const page = { ...pages[index], ...edition.pages[index] }
        if (reusable && successful(page)) continue
        onProgress?.({ phase: 'wiki-retrieve', processed: index, total: edition.pages.length, path: page.title })
        try {
          const search = await this.#search(workspace, `${page.title} ${page.description}`, { limit: 16, signal })
          const evidence = []
          const candidates = search.results.length > 0 ? search.results : seedChunks.slice(index * 4, index * 4 + 8).concat(seedChunks.slice(0, 4))
          for (const result of candidates) {
            if (!result.evidenceId) continue
            const item = await store.readEvidence(result.evidenceId)
            if (item && !evidence.some(existing => existing.evidenceId === item.evidenceId)) evidence.push(item)
          }
          onProgress?.({ phase: 'wiki-write', processed: index, total: edition.pages.length, path: page.title })
          const generated = await pageWithModel(this.#ctx, { page, evidence, sessionId, signal })
          const used = new Set(generated.usedEvidenceIds)
          const citations = evidence.filter(item => used.has(item.evidenceId)).map(citationSnapshot)
          await store.updateWikiPage(page.id, { summary: generated.summary, content: generated.content, citations, related: page.related, chapter: page.chapter, status: 'completed' })
          completed += 1
        } catch (error) {
          if (signal?.aborted) throw signal.reason ?? error
          await store.updateWikiPage(page.id, { summary: page.summary || '', content: page.content || '', citations: page.citations || [], related: page.related, chapter: page.chapter, status: 'failed', error: diagnostic(error) })
        }
        onProgress?.({ phase: 'wiki-write', processed: index + 1, total: edition.pages.length, path: page.title })
      }
      await store.publishWikiEdition(edition.id, completed < edition.pages.length ? 'partial' : 'published')
      return { editionId: edition.id, profile: effectiveProfile, pages: edition.pages.length, completed, failed: edition.pages.length - completed, sourceFingerprint }
    } catch (error) {
      await store.failWikiEdition(edition.id, error instanceof Error ? error.message : String(error)).catch(() => {})
      throw error
    }
  }
}

export { citationSnapshot, deterministicPlan, generateText, inferProfile, modelSelection }
