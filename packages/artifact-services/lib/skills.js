import {readFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

export function installArtifactSkills(ctx) {
  const disposers=[]
  for(const kind of ['documents','spreadsheets','presentations','pdfs','speech','video']) {
    const path=fileURLToPath(new URL(`../skills/${kind}/SKILL.md`,import.meta.url)),raw=readFileSync(path,'utf8')
    const description=raw.match(/^description: (.+)$/m)?.[1] || kind
    disposers.push(ctx.skills.register({name:'artifact-'+kind,description,whenToUse:description,
      invocation:{modelInvocable:true,userInvocable:true},source:'bundled',path,resourceBase:{kind:'directory',path:dirname(path)},
      content:raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim()}))
  }
  return ()=>disposers.reverse().forEach(dispose=>dispose())
}
