import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const skillURL = new URL('../skills/knowledge-studio/SKILL.md', import.meta.url)
const skillPath = fileURLToPath(skillURL)

function bodyOf(raw) {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
}

export function installKnowledgeStudioSkill(ctx) {
  const content = bodyOf(readFileSync(skillURL, 'utf8'))
  return ctx.skills.register({
    name: 'knowledge-studio',
    description: 'Search the current DSH Workspace with local evidence and create explicit Studio artifacts.',
    whenToUse: 'Use for workspace knowledge, evidence-backed workspace synthesis, briefings, study guides, FAQs, quizzes, or flashcards.',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    path: skillPath,
    resourceBase: { kind: 'directory', path: dirname(skillPath) },
    content,
  })
}
