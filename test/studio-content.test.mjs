import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import test from 'node:test'
import {mkdtemp,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {validateContent} from '../lib/studio-content.js'
import {exportDocument} from '../lib/studio-export.js'
import {ArtifactEngine} from '../lib/artifacts.js'
import {generateText,WikiGenerator} from '../lib/wiki.js'

const e={evidenceId:'e1',path:'notes.md',content:'数据质量应检查完整性。',lineStart:1,lineEnd:1,revisionHash:'r1',excerptHash:'h1'}
test('new artifact schemas reject fabricated evidence, cycles and malformed tables',()=>{
  assert.throws(()=>validateContent('report',JSON.stringify({sections:[{heading:'a',body:'b',evidenceIds:['fake']}]}),[e]),/来源/)
  assert.throws(()=>validateContent('mindmap',JSON.stringify({nodes:[{id:'a',parentId:'b',label:'A',evidenceIds:['e1']},{id:'b',parentId:'a',label:'B',evidenceIds:['e1']}]}),[e]),/循环/)
  assert.throws(()=>validateContent('table',JSON.stringify({columns:['A'],rows:[{cells:['one','two'],evidenceIds:['e1']}]}),[e]),/不一致/)
  for(const [kind,key,item] of [
    ['report','sections',{heading:'检查',body:'检查完整性'}],['mindmap','nodes',{id:'root',label:'完整性'}],['table','rows',{cells:['完整性']}],['slides','slides',{heading:'完整性',bullets:['缺失']}],['audio','segments',{speaker:'A',text:'完整性检查。'}],['video','scenes',{heading:'完整性',narration:'发现缺失字段。',bullets:['缺失字段']}]
  ])assert.equal(validateContent(kind,JSON.stringify({title:'测试',columns:['检查'],[key]:[{...item,evidenceIds:['e1']}]}),[e])[key].length,1)
})

test('table exports preserve literal cells and neutralize CSV formulas',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-export-'))
  const artifact={id:'table',kind:'table',title:'表格',citations:[e],content:{columns:['value'],rows:[{cells:['=1+1'],evidenceIds:['e1']}]}}
  const csv=await exportDocument(artifact,dir,'csv');assert.match(await readFile(csv.path,'utf8'),/'=1\+1/)
  const xlsx=await exportDocument(artifact,dir,'xlsx')
  const cells=JSON.parse(execFileSync(process.env.DSH_OFFICE_PYTHON,['-I','-c',"import json,sys,openpyxl; w=openpyxl.load_workbook(sys.argv[1]); print(json.dumps([w.worksheets[0]['A2'].value,w.worksheets[1]['A2'].value]))",xlsx.path],{encoding:'utf8',windowsHide:true}))
  assert.deepEqual(cells,['=1+1','e1'])
})

test('report lifecycle persists citations, exports, renames and removes without losing stored content',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-report-')),ws={id:'ws',title:'工作区'}
  const ctx={workspaceRegistry:{get:()=>ws},agentDefaultModel:{currentSelection:()=>({provider:'test',model:'test'})},agents:{get:()=>null},llm:{stream:async function*(){yield {type:'text-delta',index:0,text:JSON.stringify({title:'质量报告',sections:[{heading:'完整性',body:'检查缺失字段。',evidenceIds:['e1']}]})};yield {type:'finish',reason:{kind:'stop'}}}}}
  const manager={status:async()=>({indexed:true}),searchDetailed:async()=>({results:[e]}),sample:async()=>[e],readEvidence:async()=>e}
  const engine=new ArtifactEngine(ctx,manager,{artifactPath:join(dir,'artifacts.json')})
  const started=await engine.start(ws,'report',{template:'briefing'},'session')
  const done=await engine.wait(started.id);assert.equal(done.status,'completed');assert.equal(done.citations[0].evidenceId,'e1')
  const file=await engine.export(done.id,'md');assert.match(Buffer.from(file.data,'base64').toString(),/检查缺失字段/)
  assert.equal((await engine.manage(done.id,'rename','新名称')).title,'新名称')
  await engine.manage(done.id,'delete','');assert.equal((await engine.list(ws.id)).length,0);assert.ok((await engine.read(done.id)).content)
  await engine.close()
})

test('model stream terminal errors and truncation never become successful text',async()=>{
  for(const reason of [{kind:'error',failure:{message:'quota unavailable'}},{kind:'max-tokens'}]) {
    const ctx={agentDefaultModel:{currentSelection:()=>({provider:'test',model:'test'})},llm:{stream:async function*(){yield {type:'text-delta',index:0,text:'partial'};yield {type:'finish',reason}}}}
    await assert.rejects(generateText(ctx,{prompt:'test'}),/quota unavailable|长度上限/)
  }
})

test('short Wiki generation uses only supported bounded reasoning and leaves ordinary calls unchanged',async()=>{
  for(const [efforts,expected] of [[['high','low'],'low'],[['off','high'],'off'],[['high'],undefined]]) {
    const requests=[]
    const ctx={agentDefaultModel:{currentSelection:()=>({provider:'test',model:'test'})},llm:{
      resolveModelInfo:async(provider,model)=>{assert.equal(provider,'test');assert.equal(model,'test');return {reasoning:{efforts:efforts.map(id=>({id}))}}},
      stream:async function*(request){requests.push(request);yield {type:'text-delta',index:0,text:'完整内容'};yield {type:'finish',reason:{kind:'stop'}}},
    }}
    await generateText(ctx,{prompt:'test',boundedReasoning:true})
    await generateText(ctx,{prompt:'test'})
    assert.equal(requests[0].reasoningEffort,expected)
    assert.equal(requests[1].reasoningEffort,undefined)
  }
})

test('Wiki retries only unsuccessful pages in an unchanged edition',async()=>{
  const edition={id:'edition',status:'partial',sourceFingerprint:'same',pages:[{id:'a',slug:'a',title:'成功页',status:'completed',content:'原内容'},{id:'b',slug:'b',title:'失败页',status:'failed',content:''}]}
  let created=0,calls=0
  const store={fileOverview:async()=>[{path:'a.md',kind:'md'}],sourceFingerprint:async()=> 'same',wikiSnapshot:async()=>structuredClone(edition),createWikiEdition:async()=>{created++;throw new Error('must reuse')},chunks:async()=>[e],readEvidence:async()=>e,updateWikiPage:async(id,patch)=>Object.assign(edition.pages.find(p=>p.id===id),patch),publishWikiEdition:async(id,status)=>{edition.status=status},failWikiEdition:async()=>{}}
  const ctx={agentDefaultModel:{currentSelection:()=>({provider:'test',model:'test'})},llm:{stream:async function*(){calls++;yield {type:'text-delta',index:0,text:JSON.stringify({summary:'摘要',blocks:[{markdown:'检查完整性。',evidenceIds:['e1']}]})};yield {type:'finish',reason:{kind:'stop'}}}}}
  const generator=new WikiGenerator(ctx,async()=>({results:[e]}))
  const result=await generator.generate(store,{id:'ws',title:'工作区'})
  assert.equal(created,0);assert.equal(calls,1);assert.equal(result.completed,2);assert.equal(edition.pages[0].content,'原内容');assert.equal(edition.status,'published')
  await generator.generate(store,{id:'ws',title:'工作区'});assert.equal(calls,1,'unchanged complete edition must not regenerate')
})
