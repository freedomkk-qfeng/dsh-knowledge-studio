import assert from 'node:assert/strict'
import test from 'node:test'
import { KnowledgeStudioService } from '../lib/index.js'
import { TYPERT } from '../lib/typert.host.js'
import { knowledgeStudioRemote } from '../src/client/remote.ts'

test('host and mounted client agree on every remote parameter', () => {
  const shape = descriptors => descriptors.map(item => ({
    method: item.method, parameters: item.parameters.map(parameter => parameter.name),
  }))
  assert.deepEqual(shape(TYPERT.invocations), shape(knowledgeStudioRemote.descriptors))
})

test('remote methods tolerate the proxy receiver used by the Typert gateway', async () => {
  const workspace = { id: 'workspace-1', title: 'Workspace', path: 'C:/workspace' }
  const started = []
  const target = Object.assign(Object.create(KnowledgeStudioService.prototype), {
    ctx: {
      artifactServices: {ready: Promise.resolve()},
      workspaceRegistry: {
        get: id => id === workspace.id ? workspace : undefined,
        resolveByPath: async path => path === workspace.path ? workspace : undefined,
      },
    },
    settingsScope: {
      get: () => ({ maxTextFileBytes: 10, maxPdfFileBytes: 20, maxFiles: 30 }),
    },
    manager: {
      hasConsent: () => true,
      status: async () => ({
        indexed: true,
        files: 4,
        chunks: 12,
        workspace: { indexedAt: '2026-09-04T00:00:00.000Z' },
      }),
      knowledgeSummary: async () => ({
        status: 'published',
        pages: 1,
        completed: 1,
      }),
      task: () => null,
      startWiki: (_workspace, options) => {
        started.push(options)
        return { status: 'running' }
      },
    },
    artifacts: { list: async () => [] },
    registry: { list: () => [] },
    mediaProviders: { describe: async () => ({speech:[],music:[]}) },
  })
  const receiver = new Proxy(target, {})

  const snapshot = await KnowledgeStudioService.prototype.workspaceForPath.call(
    receiver,
    workspace.path,
  )
  assert.equal(snapshot.id, workspace.id)
  assert.equal(snapshot.chunks, 12)

  const result = await KnowledgeStudioService.prototype.prepare.call(receiver, workspace.id, 'session-1')
  assert.equal(result.task.status, 'running')
  assert.deepEqual(started, [{ sessionId: 'session-1', profile: 'auto', maxTextFileBytes: 10, maxPdfFileBytes: 20, maxFiles: 30 }])
})
