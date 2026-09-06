import {mkdtemp,mkdir,writeFile,appendFile,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {fork} from 'node:child_process'
import {createServer} from 'node:net'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
export async function startIsolatedHost() {
  const home=await mkdtemp(join(tmpdir(),'knowledge-studio-host-')),profile=join(home,'profiles','studio')
  await mkdir(join(profile,'node_modules'),{recursive:true})
  for(const [name,target] of [['@deepseek-ai',join(root,'node_modules','@deepseek-ai')],['@eduwork/dsh-knowledge-studio',root],['@eduwork/dsh-artifact-services',join(root,'packages','artifact-services')]]) {
    const path=join(profile,'node_modules',name);await mkdir(dirname(path),{recursive:true});await symlink(target,path,process.platform==='win32'?'junction':'dir')
  }
  await writeFile(join(profile,'package.json'),JSON.stringify({name:'isolated-studio-host',private:true,type:'module',dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@eduwork/dsh-knowledge-studio']}}}))
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
  const child=fork(fileURLToPath(new URL('./host-worker.mjs',import.meta.url)),[home,String(port)],{cwd:root,env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true})
  await writeFile(join(home,'process.json'),JSON.stringify({pid:child.pid,startedAt:new Date().toISOString(),port}))
  const exited=new Promise(resolve=>child.once('exit',resolve))
  const stop=async()=>{if(child.connected)child.send('stop');await exited}
  let output=''
  const ready=new Promise((resolve,reject)=>{
    child.once('error',reject);child.once('exit',code=>reject(new Error('Isolated DSH host exited before readiness: '+code)))
    for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{
      const text=bytes.toString();void appendFile(join(home,'host.log'),text);output+=text
      const launch=output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0]
      if(launch)resolve(launch)
    })
  })
  try {return {home,port,child,stop,launch:await ready}}catch(error){await stop();throw error}
}
