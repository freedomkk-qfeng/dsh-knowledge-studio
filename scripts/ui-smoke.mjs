import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
const directory=resolve('dist/ui');await mkdir(directory,{recursive:true})
const result=await build({entryPoints:['test/fixtures/studio-ui.tsx'],bundle:true,write:false,format:'iife',platform:'browser'})
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html; charset=utf-8');res.end(req.url==='/app.js'?result.outputFiles[0].text:'<!doctype html><meta charset="utf-8"><style>body{margin:0}</style><div id="root"></div><script src="/app.js"></script>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({...(process.env.STUDIO_TEST_BROWSER?{executablePath:process.env.STUDIO_TEST_BROWSER}:{}),headless:true})
const page=await browser.newPage({viewport:{width:1100,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 await page.locator('[data-knowledge-studio-capability="report"]').waitFor()
 assert.equal(await page.locator('[data-knowledge-studio-capability]').count(),8)
 assert.equal(await page.locator('[data-knowledge-studio-capability] [data-studio-icon]').count(),8)
 assert.equal(new Set(await page.locator('[data-knowledge-studio-capability] svg').evaluateAll(icons=>icons.map(icon=>icon.innerHTML))).size,8)
 assert.equal(await page.getByRole('button',{name:'重试未成功页面'}).count(),0)
 await page.screenshot({path:resolve(directory,'01-home.png')})
 await page.getByRole('button',{name:'工作区知识'}).click();assert.equal(await page.getByRole('button',{name:'重试未成功页面'}).count(),1)
 await page.getByRole('button',{name:'搜索资料',exact:true}).click();await page.getByRole('textbox',{name:'搜索资料'}).fill('质量');await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByRole('button',{name:/数据质量.*治理学习资料/}).waitFor()
 await page.screenshot({path:resolve(directory,'02-search.png')});await page.getByRole('button',{name:'清空'}).click();assert.equal(await page.getByRole('textbox').inputValue(),'')
 await page.getByRole('button',{name:'关闭搜索'}).click();await page.getByRole('button',{name:'打开 Wiki'}).click();await page.getByText('模型输出达到长度上限').waitFor();await page.getByRole('button',{name:'←',exact:true}).click()
 await page.getByRole('button',{name:/数据治理入门报告/}).click();await page.getByRole('button',{name:'更多操作'}).click();await page.getByRole('button',{name:'重命名'}).click();await page.getByRole('textbox',{name:'成果名称'}).fill('修改后的报告');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('修改后的报告',{exact:true}).waitFor()
 await page.getByRole('button',{name:'问问 AI'}).click();assert.equal(await page.getByRole('status').textContent(),'ask')
 await page.screenshot({path:resolve(directory,'03-report.png')});await page.getByRole('button',{name:'移除',exact:true}).click();await page.getByRole('button',{name:'移除',exact:true}).last().click();await page.getByRole('button',{name:'打开 Wiki'}).waitFor()
 assert.deepEqual(errors,[]);await writeFile(resolve(directory,'ui-smoke.json'),JSON.stringify({passed:true,checks:['eight capabilities','knowledge collapse','search clear and close','wiki error detail','rename','ask','remove'],errors},null,2));console.log('UI smoke passed')
}finally{await browser.close();server.close()}
