import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ArtifactEngine } from './artifacts.js'
import { StudioRegistry } from './capabilities.js'
import { KnowledgeIndexManager } from './manager.js'
import { KnowledgeStudioSettingsSchema, mergeDefaultSettings, SETTINGS_NAMESPACE, validateSettings, WIKI_PROFILES } from './settings.js'
import { installKnowledgeStudioSkill } from './skill.js'
import { installKnowledgeStudioTools } from './tools.js'
import { basicEvidence } from './basic-evidence.js'
import { createMediaProviders } from './studio-media.js'
import { mediaParameters } from './capabilities.js'

export const name = 'dsh-knowledge-studio'
const initializers = []

export class KnowledgeStudioService extends TypertRemoteService {
  static inject = ['tools', 'workspaceRegistry', 'fs', 'settings', 'skills', 'llm', 'agents', 'agentDefaultModel', 'artifactServices']

  constructor(ctx, config = {}) {
    super(ctx, 'knowledgeStudio')
    this.settingsScope = ctx.settings.register(SETTINGS_NAMESPACE, KnowledgeStudioSettingsSchema, {
      base: mergeDefaultSettings(config), applies: 'live', validate: validateSettings,
    })
    this.manager = new KnowledgeIndexManager(ctx, config)
    this.mediaProviders = ctx.artifactServices.media
    this.artifacts = new ArtifactEngine(ctx, this.manager, {...config,mediaProviders:this.mediaProviders})
    this.registry = new StudioRegistry()
    installKnowledgeStudioTools(ctx, this.manager, this.artifacts)
    const disposeSkill = installKnowledgeStudioSkill(ctx)
    ctx.effect(() => disposeSkill, 'dsh-knowledge-studio: bundled skill')
    ctx.effect(() => async () => {
      await this.artifacts.close()
      await this.manager.close()
    }, 'dsh-knowledge-studio: close tasks and local stores')
    for (const initialize of initializers) initialize.call(this)
  }

  settings() { return this.settingsScope.get() }

  workspace(workspaceId) {
    const workspace = this.ctx.workspaceRegistry.get(workspaceId)
    if (!workspace) throw new Error(`Unknown DSH workspace: ${workspaceId}`)
    return workspace
  }

  async snapshot(workspace) {
    const status = await this.manager.status(workspace)
    const wiki = status.indexed ? await this.manager.knowledgeSummary(workspace) : null
    return {
      id: String(workspace.id), title: workspace.title, path: workspace.path,
      consented: this.manager.hasConsent(workspace.id),
      indexed: status.indexed, files: status.files, chunks: status.chunks,
      indexedAt: status.workspace?.indexedAt ?? null,
      knowledgeQuality: wiki?.status ?? null,
      knowledgeReady: wiki?.status === 'published',
      knowledgePages: wiki?.completed ?? 0,
      task: this.manager.task(workspace.id),
      capabilities: await this.listCapabilities(),
      artifacts: await this.artifacts.list(workspace.id),
    }
  }

  async workspaceForPath(path) {
    const workspace = await this.ctx.workspaceRegistry.resolveByPath(String(path ?? ''))
    return workspace ? this.snapshot(workspace) : null
  }

  workspaceStatus(workspaceId) {
    return this.snapshot(this.workspace(workspaceId))
  }

  async listCapabilities() {
    await this.ctx.artifactServices.ready
    const media=await this.mediaProviders.describe()
    return this.registry.list().map(cap=>['audio','video'].includes(cap.id)?{...cap,available:cap.id==='audio'?media.speech.some(p=>p.available&&p.voices.length):cap.available,parameters:[...cap.parameters,...mediaParameters(cap.id,media)]}:cap)
  }

  registerSpeechProvider(provider) {return this.mediaProviders.registerSpeech(provider)}
  registerBackgroundMusic(track) {return this.mediaProviders.registerMusic(track)}

  registerStudioCapability(capability, execute) {
    return this.registry.register(capability, execute)
  }

  indexOptions() {
    const settings = this.settings()
    return {
      maxTextFileBytes: settings.maxTextFileBytes,
      maxPdfFileBytes: settings.maxPdfFileBytes,
      maxFiles: settings.maxFiles,
    }
  }

  async prepare(workspaceId, sessionId, consent) {
    const workspace = this.workspace(workspaceId)
    if (consent === true) await this.manager.acceptConsent(workspaceId)
    const active = this.manager.task(workspaceId)
    if (active && ['running', 'stopping'].includes(active.status)) return { workspaceId, task: active }
    return {
      workspaceId,
      task: this.manager.startWiki(workspace, {
        sessionId,
        profile: 'auto',
        ...this.indexOptions(),
      }),
    }
  }

  async cancelTask(workspaceId) {
    this.workspace(workspaceId)
    return { workspaceId, task: this.manager.cancelTask(workspaceId) }
  }

  async search(workspaceId, query, limit, pathPrefix) {
    const workspace = this.workspace(workspaceId)
    const status=await this.manager.status(workspace)
    if(!status.indexed) return {results:await basicEvidence(this.ctx.fs,workspace,query,{limit:Math.min(30,limit||12),pathPrefix})}
    return this.manager.searchDetailed(workspace, query, { limit, pathPrefix })
  }

  async readEvidence(workspaceId, evidenceId) {
    return { workspaceId, evidence: await this.manager.readEvidence(this.workspace(workspaceId), evidenceId) }
  }

  async wiki(workspaceId) {
    return { workspaceId, wiki: await this.manager.wikiSnapshot(this.workspace(workspaceId)) }
  }

  async readWikiPage(workspaceId, pageId) {
    return { workspaceId, page: await this.manager.readWikiPage(this.workspace(workspaceId), pageId) }
  }

  async invokeStudio(workspaceId, capabilityId, parameters, sessionId) {
    const workspace = this.workspace(workspaceId)
    const capability = this.registry.get(capabilityId)
    if (!capability) throw new Error(`Unknown Studio capability: ${capabilityId}`)
    if (!capability.available) throw new Error(`${capability.title} is not available in this build yet`)
    if (typeof capability.execute === 'function') {
      return capability.execute({ ctx: this.ctx, workspace, parameters: parameters ?? {}, sessionId, manager: this.manager })
    }
    if (capability.execution === 'conversation') {
      return { action: 'compose', prompt: capability.prompt, capabilityId: capability.id }
    }
    if (capability.execution === 'artifact') {
      return { action: 'artifact', capabilityId: capability.id, artifact: await this.artifacts.start(workspace, capability.id, parameters, sessionId) }
    }
    throw new Error(`Studio capability has no executor: ${capability.id}`)
  }

  async listArtifacts(workspaceId) {
    this.workspace(workspaceId)
    return { workspaceId, artifacts: await this.artifacts.list(workspaceId) }
  }

  async readArtifact(artifactId) {
    return { artifact: await this.artifacts.read(artifactId) }
  }

  async updateArtifactInteraction(artifactId, action, itemId, value) {
    return { artifact: await this.artifacts.interaction(artifactId, action, itemId, value) }
  }

  async artifactAskPrompt(artifactId, itemId) {
    return { prompt: await this.artifacts.askPrompt(artifactId, itemId) }
  }

  async manageArtifact(artifactId, action, value, sessionId) {
    return { artifact:await this.artifacts.manage(artifactId,action,value,sessionId) }
  }
  async exportArtifact(artifactId, format) {
    return { file:await this.artifacts.export(artifactId,format) }
  }

  async clear(workspaceId) {
    await this.manager.clear(this.workspace(workspaceId))
    return { workspaceId, cleared: true }
  }
}

const remoteMethods = [
  'workspaceForPath', 'workspaceStatus', 'listCapabilities', 'prepare', 'cancelTask',
  'search', 'readEvidence', 'wiki', 'readWikiPage', 'invokeStudio',
  'listArtifacts', 'readArtifact', 'updateArtifactInteraction', 'artifactAskPrompt', 'manageArtifact', 'exportArtifact', 'clear',
]

for (const method of remoteMethods) {
  Remote(method)(KnowledgeStudioService.prototype[method], {
    kind: 'method', name: method, static: false, private: false,
    addInitializer(initializer) { initializers.push(initializer) },
  })
}

export { StudioRegistry } from './capabilities.js'
export { KnowledgeIndexManager } from './manager.js'
export { WorkspaceKnowledgeStore } from './store.js'
export { WIKI_PROFILES } from './settings.js'
export default KnowledgeStudioService
