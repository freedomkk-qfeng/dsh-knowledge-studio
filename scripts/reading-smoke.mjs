import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
const directory=resolve('dist/ui');await mkdir(directory,{recursive:true})
const result=await build({entryPoints:['test/fixtures/wiki-reading.tsx'],bundle:true,write:false,format:'iife',platform:'browser'})
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html; charset=utf-8');res.end(req.url==='/app.js'?result.outputFiles[0].text:'<!doctype html><meta charset="utf-8"><style>body{margin:0;font-family:Microsoft YaHei,sans-serif}</style><div id="root"></div><script src="/app.js"></script>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({...(process.env.STUDIO_TEST_BROWSER?{executablePath:process.env.STUDIO_TEST_BROWSER}:{}),headless:true})
const page=await browser.newPage({viewport:{width:1280,height:820}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 await page.getByRole('button',{name:'展开阅读',exact:true}).click()
 assert.equal(await page.locator('main').getAttribute('inert'),'')
 const layer=page.locator('[data-studio-reading-layer]');assert.equal(Math.round((await layer.boundingBox()).x),180);assert.equal(Math.round((await layer.boundingBox()).width),1100)
 await page.getByRole('button',{name:/▾ 使用指南/}).click();assert.equal(await page.getByRole('button',{name:'●质量检查'}).count(),0)
 await page.getByRole('button',{name:/▸ 使用指南/}).click()
 await page.getByText('本页导航 · 14 节',{exact:true}).click();await page.getByRole('button',{name:'小节 10',exact:true}).click();await page.waitForTimeout(1000)
 const before=await page.getByRole('article',{name:'Wiki 正文'}).evaluate(n=>n.scrollTop);assert.ok(before>500)
 await page.getByRole('button',{name:'返回对话',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'对话草稿'}).inputValue(),'我的未发送草稿')
 await page.getByRole('button',{name:'展开阅读',exact:true}).click();await page.waitForTimeout(150)
 const after=await page.getByRole('article',{name:'Wiki 正文'}).evaluate(n=>n.scrollTop);assert.ok(Math.abs(after-before)<10,`scroll before=${before}, after=${after}`)
 await page.getByRole('button',{name:/●.*质量检查/}).click();await page.getByRole('heading',{name:'质量检查',exact:true}).waitFor()
 await page.getByRole('button',{name:'查看来源',exact:true}).click();await page.getByRole('button',{name:'返回阅读',exact:true}).click();await page.getByRole('heading',{name:'质量检查',exact:true}).waitFor()
 await page.getByRole('button',{name:'问问 AI',exact:true}).click();assert.match(await page.getByRole('textbox',{name:'对话草稿'}).inputValue(),/^我的未发送草稿\n讨论 质量检查/)
 await page.getByRole('button',{name:'展开阅读',exact:true}).click();await page.getByRole('button',{name:/○.*待完成页面/}).click();await page.getByRole('alert').filter({hasText:'模型暂时不可用'}).waitFor()
 await page.getByRole('button',{name:/●.*质量检查/}).click();await page.screenshot({path:resolve(directory,'reading-wide.png')})
 await page.setViewportSize({width:700,height:820});await page.screenshot({path:resolve(directory,'reading-narrow.png')})
 const nav=await page.getByRole('navigation',{name:'Wiki 章节目录'}).boundingBox(),article=await page.getByRole('article',{name:'Wiki 正文'}).boundingBox();assert.ok(article.y>=nav.y+nav.height-1)
 await page.getByRole('button',{name:'切换会话',exact:true}).click();assert.equal(await layer.getAttribute('data-reading-active'),'false');assert.equal(await layer.locator(':scope > *').count(),0);assert.equal(await page.locator('main').getAttribute('inert'),null)
 assert.deepEqual(errors,[])
 await writeFile(resolve(directory,'reading-smoke.json'),JSON.stringify({passed:true,checks:['chapter collapse','active page','heading navigation','expanded geometry','draft preservation','reading scroll preservation','source return','ask context','failed page','narrow layout','session switch cleanup'],errors},null,2));console.log('Reading smoke passed')
}finally{await browser.close();server.close()}
