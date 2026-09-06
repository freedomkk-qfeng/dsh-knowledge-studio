import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createMediaRuntime} from '../packages/artifact-services/lib/runtime.js'

test('managed media uses the supplied browser and rejects incomplete or mixed runtime versions',async t=>{
  const root=await mkdtemp(join(tmpdir(),'artifact-runtime-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const browser=join(root,'chrome.exe')
  await writeFile(browser,'fixture')
  await writeFile(join(root,'package.json'),'{}')
  for(const name of ['remotion','@remotion/bundler','@remotion/renderer','@remotion/media','@remotion/captions','react','react-dom']) {
    const directory=join(root,'node_modules',name)
    await mkdir(directory,{recursive:true})
    await writeFile(join(directory,'package.json'),JSON.stringify({name,version:name.startsWith('react')?'18.3.1':'4.0.520'}))
  }
  const environment={DSH_MEDIA_NODE_ENV:root,DSH_MEDIA_BROWSER:browser}
  const runtime=await createMediaRuntime({environment})
  assert.equal(runtime.browserExecutable,await realpath(browser))
  assert.equal(runtime.nodeEnv,await realpath(root))
  await assert.rejects(createMediaRuntime({environment:{DSH_MEDIA_NODE_ENV:root}}),/requires absolute/)
  await writeFile(join(root,'node_modules','remotion','package.json'),'{"version":"4.0.499"}')
  await assert.rejects(createMediaRuntime({environment}),/version mismatch/)
  await assert.rejects(createMediaRuntime({environment,signal:AbortSignal.abort()}),{name:'AbortError'})
})
