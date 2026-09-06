import { defineTool } from '@deepseek-ai/dsh-tools'

function renderJSON(tag, value) {
  return [{ type: 'text', text: `<${tag}>\n${JSON.stringify(value, null, 2)}\n</${tag}>` }]
}

function searchMeta(results) {
  const byPath = new Map()
  for (const result of results) {
    const match = { lineNumber: result.pageStart ?? result.lineStart, line: result.content.split('\n', 1)[0].slice(0, 500) }
    const matches = byPath.get(result.path)
    if (matches) matches.push(match)
    else byPath.set(result.path, [match])
  }
  return { shape: 'matches', files: [...byPath].map(([path, matches]) => ({ path, matches })), truncated: false, total: results.length }
}

function searchViewFromResult(result) {
  if (result.isError || result.meta?.shape !== 'matches' || !Array.isArray(result.meta.files)) return undefined
  return { card: 'search', ...result.meta, title: 'Workspace knowledge search' }
}

export function installKnowledgeStudioTools(ctx, manager, artifacts) {
  if (artifacts) ctx.tools.register(defineTool({
    name: 'knowledge_studio_create_artifact',
    description: 'Generate and save a grounded Studio report, mindmap, quiz, flashcards, table, slides, audio or video using current workspace files. Wiki is optional. Media produces actual files through local rendering. Only report success when status is completed; include returned error if failed.',
    parameters: {
      kind: { type: 'string', required: true, enum: ['quiz', 'flashcards', 'report', 'mindmap', 'table', 'slides', 'audio', 'video'] },
      count: { type: 'integer' },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
      focus: { type: 'string' },
      pathPrefix: { type:'string' },
      template: { type:'string' },
      columns: { type:'string' },
      style: { type:'string' },
      delivery: { type:'string',enum:['presentation','reading'] },
      language: { type:'string' },
      audience: { type:'string' },
      narration: { type:'string', enum:['on','off'] },
      subtitles: { type:'string', enum:['on','off'] },
      provider: { type:'string' },
      voice: { type:'string' },
      voiceB: { type:'string' },
      speed: { type:'number' },
      aspect: { type:'string', enum:['16:9','9:16','1:1'] },
      bgm: { type:'string' },
      bgmVolume: { type:'number' },
      sceneSeconds: { type:'number' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        artifactId: { type: 'string', required: true }, status: { type: 'string', required: true },
        message: { type: 'string', required: true },
      } },
      render: (_args, value) => renderJSON('studio_artifact', value),
    },
    async execute(args, exec) {
      const workspace = await manager.workspaceForAgent(exec.agent)
      const artifact = await artifacts.start(workspace, args.kind, args, exec.agent?.session?.id, exec.signal, exec)
      const result = await artifacts.wait(artifact.id)
      return { artifactId: result.id, status: result.status, message: result.message || '成果已保存在 Studio 右栏，可答题、翻卡和继续追问。' }
    },
    presentCall: args => ({ card: 'generic', title: `Studio · ${args.kind}`, kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'knowledge_studio_status',
    description: 'Report the local knowledge-index status of the current DSH Workspace. This never starts indexing.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        indexed: { type: 'boolean', required: true }, statusJSON: { type: 'string', required: true },
      } },
      render: (_args, value) => renderJSON('knowledge_studio_status', JSON.parse(value.statusJSON)),
    },
    async execute(_args, exec) {
      const workspace = await manager.workspaceForAgent(exec.agent)
      const status = await manager.status(workspace)
      return { indexed: status.indexed, statusJSON: JSON.stringify({ ...status, task: manager.task(workspace.id) }) }
    },
    presentCall: () => ({ card: 'generic', title: 'Check workspace knowledge', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'knowledge_studio_search',
    description: 'Search the locally indexed current DSH Workspace. Returns revision-bound Evidence ids, paths, headings, locators, and text. Try several lexical queries when the first wording is too broad.',
    parameters: {
      query: { type: 'string', required: true, description: 'Natural-language, filename, symbol, path, or keyword query.' },
      limit: { type: 'integer', description: 'Maximum results, 1-50; defaults to 10.' },
      path_prefix: { type: 'string', description: 'Optional workspace-relative path prefix.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        results: { type: 'array', required: true, items: { type: 'object', additionalProperties: true } },
      } },
      render: (_args, value) => renderJSON('knowledge_studio_results', value.results),
      presentationMeta: (_args, value) => searchMeta(value.results),
    },
    async execute(args, exec) {
      const workspace = await manager.workspaceForAgent(exec.agent)
      return { results: await manager.search(workspace, args.query, { limit: args.limit, pathPrefix: args.path_prefix }) }
    },
    presentCall: args => ({ card: 'generic', title: `Search workspace · ${args.query}`, kind: 'search', rawInput: args.query }),
    presentResult: (_args, result) => searchViewFromResult(result),
  }))

  ctx.tools.register(defineTool({
    name: 'knowledge_studio_read',
    description: 'Read one exact indexed chunk returned by knowledge_studio_search.',
    parameters: { chunk_id: { type: 'string', required: true } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        found: { type: 'boolean', required: true }, chunkJSON: { type: 'string', required: true },
      } },
      render: (_args, value) => renderJSON('knowledge_studio_chunk', JSON.parse(value.chunkJSON)),
    },
    async execute(args, exec) {
      const workspace = await manager.workspaceForAgent(exec.agent)
      const chunk = await manager.readChunk(workspace, args.chunk_id)
      return { found: Boolean(chunk), chunkJSON: JSON.stringify(chunk) }
    },
    presentCall: () => ({ card: 'generic', title: 'Read workspace evidence', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'knowledge_studio_neighbors',
    description: 'Read deterministic context around one indexed chunk: preceding/following chunks and explicitly linked files.',
    parameters: { chunk_id: { type: 'string', required: true } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        found: { type: 'boolean', required: true }, neighborsJSON: { type: 'string', required: true },
      } },
      render: (_args, value) => renderJSON('knowledge_studio_neighbors', JSON.parse(value.neighborsJSON)),
    },
    async execute(args, exec) {
      const workspace = await manager.workspaceForAgent(exec.agent)
      const neighbors = await manager.neighbors(workspace, args.chunk_id)
      return { found: Boolean(neighbors), neighborsJSON: JSON.stringify(neighbors) }
    },
    presentCall: () => ({ card: 'generic', title: 'Read neighboring evidence', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'knowledge_studio_generate_wiki',
    description: 'Build or refresh the current Workspace Knowledge. This unified operation creates the local retrieval data and its evidence-backed visual knowledge pages, and may consume credits through the current DSH model. Call only after explicit user consent.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        started: { type: 'boolean', required: true }, taskJSON: { type: 'string', required: true },
      } },
      render: (_args, value) => renderJSON('knowledge_studio_wiki_task', JSON.parse(value.taskJSON)),
    },
    async execute(_args, exec) {
      const workspace = await manager.workspaceForAgent(exec.agent)
      const task = manager.startWiki(workspace, { sessionId: exec.agent?.session?.id, profile: 'auto' })
      return { started: true, taskJSON: JSON.stringify(task) }
    },
    presentCall: () => ({ card: 'generic', title: 'Build workspace knowledge', kind: 'write' }),
  }))
}

export const installTools = installKnowledgeStudioTools
