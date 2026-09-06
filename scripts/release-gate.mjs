import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { appendFile, lstat, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = 'freedomkk-qfeng/dsh-knowledge-studio'
const repositoryUrl = `git+https://github.com/${repository}.git`
const registry = 'https://registry.npmjs.org'
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const packageDefinitions = [
  { key: 'shared', name: '@eduwork/dsh-artifact-services', manifest: 'packages/artifact-services/package.json' },
  { key: 'studio', name: '@eduwork/dsh-knowledge-studio', manifest: 'package.json' },
]

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), 'utf8'))
}

// Dispatch inputs are data. They are never interpolated into a shell command.
export function validateInputs(env, manifests) {
  const target = env.RELEASE_PACKAGE || 'shared'
  assert.ok(['shared', 'studio'].includes(target), 'RELEASE_PACKAGE must be shared or studio')
  const publishValue = env.RELEASE_PUBLISH || 'false'
  assert.ok(['true', 'false'].includes(publishValue), 'RELEASE_PUBLISH must be true or false')
  const publish = publishValue === 'true'
  const selected = manifests.find(item => item.key === target)
  assert.ok(selected, 'Selected package manifest is missing')
  assert.match(selected.version, stableVersion, 'Releases require a stable package version')
  const tag = env.RELEASE_TAG || ''
  const expectedTag = `${target}-v${selected.version}`
  if (publish || tag) assert.equal(tag, expectedTag, `Use the existing tag ${expectedTag}`)
  return { target, publish, tag, selected }
}

async function githubJson(path) {
  assert.ok(process.env.GH_TOKEN, 'GH_TOKEN is required for the read-only GitHub release gate')
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(30_000),
  })
  assert.ok(response.ok, `GitHub release gate request failed (HTTP ${response.status})`)
  return response.json()
}

async function successfulCI(commit) {
  assert.equal(process.env.GITHUB_REPOSITORY, repository, 'Publishing is restricted to the source repository')
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'Publishing requires a manual workflow run')
  const repo = await githubJson(`/repos/${repository}`)
  assert.equal(repo.fork, false, 'Publishing from a fork is not allowed')
  assert.equal(repo.private, false, 'Publishing requires the public source repository')
  for (let page = 1; page <= 10; page++) {
    const query = new URLSearchParams({ head_sha: commit, status: 'success', per_page: '100', page: String(page) })
    const result = await githubJson(`/repos/${repository}/actions/workflows/ci.yml/runs?${query}`)
    const run = result.workflow_runs.find(item =>
      item.head_sha === commit && item.status === 'completed' && item.conclusion === 'success' &&
      ['push', 'workflow_dispatch'].includes(item.event) &&
      item.repository?.full_name === repository && item.head_repository?.full_name === repository)
    if (run) return { id: run.id, url: run.html_url }
    if (result.workflow_runs.length < 100) break
  }
  throw new Error(`No successful source-repository CI workflow exists for commit ${commit}; run CI first`)
}

async function context() {
  const manifests = []
  for (const definition of packageDefinitions) {
    const manifest = await readJson(definition.manifest)
    assert.equal(manifest.name, definition.name, 'Unexpected public package name')
    assert.match(manifest.version, stableVersion, 'Both public package versions must be stable')
    assert.equal(manifest.repository?.url, repositoryUrl, 'Package repository must match the public source repository')
    assert.equal(manifest.publishConfig?.access, 'public', 'Both packages must declare public access')
    manifests.push({ ...definition, version: manifest.version, manifest })
  }
  const [shared, studio] = manifests
  assert.equal(studio.manifest.dependencies?.[shared.name], shared.version, 'Studio must pin the exact shared package version')
  const lock = await readJson('package-lock.json')
  assert.equal(lock.name, studio.name, 'Root lock package name is out of date')
  assert.equal(lock.version, studio.version, 'Root lock version is out of date')
  assert.equal(lock.packages?.['']?.version, studio.version, 'Studio workspace lock version is out of date')
  assert.equal(lock.packages?.['']?.dependencies?.[shared.name], shared.version, 'Studio dependency lock is out of date')
  assert.equal(lock.packages?.['packages/artifact-services']?.version, shared.version, 'Shared workspace lock version is out of date')
  const inputs = validateInputs(process.env, manifests)
  const commit = git('rev-parse', '--verify', 'HEAD^{commit}')
  assert.match(commit, /^[a-f\d]{40}$/, 'The checkout must resolve to a full Git commit')
  // Build outputs are ignored; maintained source files must still match this commit.
  git('diff', '--quiet', 'HEAD', '--')
  if (process.env.RELEASE_EXPECTED_COMMIT) {
    assert.equal(commit, process.env.RELEASE_EXPECTED_COMMIT, 'The publish checkout differs from the checked build')
  }
  if (inputs.tag) {
    const taggedCommit = git('rev-parse', '--verify', `refs/tags/${inputs.tag}^{commit}`)
    assert.equal(taggedCommit, commit, 'The existing release tag must resolve to the checked-out commit')
  }
  if (inputs.publish) {
    assert.equal(process.env.GITHUB_SHA, commit, 'Dispatch the workflow from the same commit/tag as the source ref so npm provenance identifies the checked source')
  }
  const ci = inputs.publish ? await successfulCI(commit) : null
  return { ...inputs, manifests, commit, ci }
}

// Read the short, ordinary package.json entry without extracting any archive paths.
export function tarballManifest(compressed) {
  const tar = gunzipSync(compressed, { maxOutputLength: 256 * 1024 * 1024 })
  let manifest
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').split('\0')[0]
    const sizeField = field(124, 12).trim()
    assert.match(sizeField, /^[0-7]+$/, 'Invalid npm tar entry size')
    const size = Number.parseInt(sizeField, 8)
    const dataStart = offset + 512
    assert.ok(Number.isSafeInteger(size) && dataStart + size <= tar.length, 'Truncated npm tar entry')
    const prefix = field(345, 155)
    const name = `${prefix ? `${prefix}/` : ''}${field(0, 100)}`.replace(/^\.\//, '')
    if (name === 'package/package.json') {
      assert.ok(header[156] === 0 || header[156] === 48, 'Package manifest must be a regular file')
      assert.equal(manifest, undefined, 'Package archive contains duplicate manifests')
      manifest = JSON.parse(tar.subarray(dataStart, dataStart + size).toString('utf8'))
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  assert.ok(manifest, 'Package archive has no package/package.json')
  return manifest
}

async function packagesFor(ctx) {
  const packages = []
  for (const item of ctx.manifests) {
    const filename = `${item.name.replace(/^@/, '').replace('/', '-')}-${item.version}.tgz`
    const path = join(root, 'dist', 'packages', filename)
    const info = await lstat(path)
    assert.ok(info.isFile() && !info.isSymbolicLink(), 'A release tarball must be a regular file')
    const bytes = await readFile(path)
    const packed = tarballManifest(bytes)
    assert.equal(packed.name, item.name, 'Packed package name differs from the checked source')
    assert.equal(packed.version, item.version, 'Packed package version differs from the checked source')
    assert.equal(packed.repository?.url, repositoryUrl, 'Packed repository differs from the checked source')
    assert.equal(packed.publishConfig?.access, 'public', 'Packed package must declare public access')
    if (item.key === 'studio') {
      assert.equal(packed.dependencies?.[ctx.manifests[0].name], ctx.manifests[0].version, 'Packed Studio must pin the shared release')
    }
    packages.push({
      name: item.name, version: item.version, filename, size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    })
  }
  return packages
}

async function requirePublishedShared(ctx) {
  const shared = ctx.manifests[0]
  const response = await fetch(`${registry}/${encodeURIComponent(shared.name)}/${encodeURIComponent(shared.version)}`, {
    signal: AbortSignal.timeout(30_000),
  })
  assert.ok(response.ok, `Publish ${shared.name}@${shared.version} first; registry lookup returned HTTP ${response.status}`)
  const published = await response.json()
  assert.equal(published.name, shared.name, 'Registry returned an unexpected shared package')
  assert.equal(published.version, shared.version, 'The exact shared dependency is not published')
}

async function outputs(values) {
  for (const [key, value] of Object.entries(values)) {
    assert.ok(!String(value).includes('\n') && !String(value).includes('\r'), 'Invalid workflow output')
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
  }
}

export async function main(mode = process.argv[2]) {
  assert.ok(['preflight', 'record', 'verify'].includes(mode), 'Usage: node scripts/release-gate.mjs preflight|record|verify')
  const ctx = await context()
  const selectedFilename = `${ctx.selected.name.replace(/^@/, '').replace('/', '-')}-${ctx.selected.version}.tgz`
  const output = { commit: ctx.commit, name: ctx.selected.name, version: ctx.selected.version, tarball: `dist/packages/${selectedFilename}` }
  if (mode === 'record') {
    const packages = await packagesFor(ctx)
    const record = {
      schema: 1, repository, commit: ctx.commit, target: ctx.target,
      tag: ctx.tag, publishRequested: ctx.publish, ci: ctx.ci,
      runId: process.env.GITHUB_RUN_ID || null, runAttempt: process.env.GITHUB_RUN_ATTEMPT || null, packages,
    }
    await writeFile(join(root, 'dist', 'packages', 'release-gate.json'), `${JSON.stringify(record, null, 2)}\n`)
  } else if (mode === 'verify') {
    assert.equal(ctx.publish, true, 'The publish verification step requires explicit RELEASE_PUBLISH=true')
    assert.ok(process.env.RELEASE_EXPECTED_COMMIT, 'The publish job must supply the checked build commit')
    const npm = execFileSync('npm', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    assert.match(npm, /^\d+\.\d+\.\d+$/, 'Cannot determine the npm CLI version')
    const [major, minor, patch] = npm.split('.').map(Number)
    assert.ok(major > 11 || (major === 11 && (minor > 5 || (minor === 5 && patch >= 1))), 'npm >=11.5.1 is required for trusted publishing')
    const record = await readJson('dist/packages/release-gate.json')
    assert.equal(record.schema, 1, 'Unknown release record format')
    assert.equal(record.repository, repository, 'Package artifact came from another repository')
    assert.equal(record.commit, ctx.commit, 'Package artifact came from another source commit')
    assert.equal(record.target, ctx.target, 'Package artifact was checked for another release target')
    assert.equal(record.tag, ctx.tag, 'Package artifact was checked for another tag')
    assert.equal(record.publishRequested, true, 'A build-only candidate cannot be promoted without a new checked publish run')
    assert.ok(process.env.GITHUB_RUN_ID, 'The publish verification step requires a GitHub workflow run')
    assert.equal(record.runId, process.env.GITHUB_RUN_ID, 'Package artifact came from another workflow run')
    assert.deepEqual(record.packages, await packagesFor(ctx), 'The checked package bytes changed before publication')
    if (ctx.target === 'studio') await requirePublishedShared(ctx)
  }
  await outputs(output)
  console.log(JSON.stringify({ mode, ...output, publish: ctx.publish, ci: ctx.ci }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Release gate failed: ${error.message}`)
    process.exitCode = 1
  })
}
