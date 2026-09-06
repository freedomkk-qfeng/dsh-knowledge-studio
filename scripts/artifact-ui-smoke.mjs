import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import {resolve} from 'node:path'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
const result=await build({entryPoints:['test/fixtures/artifact-ui.tsx'],bundle:true,write:false,format:'iife',platform:'browser'})
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html; charset=utf-8');res.end(req.url==='/app.js'?result.outputFiles[0].text:'<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({...(process.env.STUDIO_TEST_BROWSER?{executablePath:process.env.STUDIO_TEST_BROWSER}:{}),headless:true})
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 await expect(page.locator('[data-studio-media-preview]').getByRole('status')).toContainText('正在载入')
 await page.getByRole('button',{name:'audio',exact:true}).click();await expect(page.locator('audio')).toBeVisible()
 const url=await page.locator('audio').getAttribute('src');await page.getByRole('button',{name:'完成旧请求'}).click()
 await expect(page.locator('audio')).toHaveAttribute('src',url)
 await page.getByRole('button',{name:'刷新状态'}).click();await expect(page.locator('[data-calls]')).toHaveText('2')
 await expect(page.locator('[data-studio-script]')).not.toHaveAttribute('open','');await expect(page.getByText('隐藏的逐字稿')).not.toBeVisible()
 await page.locator('[data-studio-script] summary').click();await expect(page.getByText('隐藏的逐字稿')).toBeVisible()
 await page.getByRole('button',{name:'failure',exact:true}).click();await expect(page.getByRole('alert')).toContainText('测试加载失败')
 await page.getByRole('button',{name:'重试预览'}).click();await expect(page.locator('audio')).toBeVisible()
 for(const [kind,format] of [['report','DOCX'],['slides','PPTX'],['table','XLSX']]){
  await page.getByRole('button',{name:kind,exact:true}).click();await expect(page.getByRole('button',{name:'下载 '+format})).toBeVisible()
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载 '+format}).click();assert.equal((await download).suggestedFilename(),kind+'.'+format.toLowerCase())
  await expect(page.getByRole('link',{name:'保存 '+format})).toBeVisible()
  await expect(page.locator('[data-studio-sources]')).not.toHaveAttribute('open','');assert.equal(await page.locator(`header [data-studio-icon="${kind}"]`).count(),1)
 }
 assert.equal(await page.getByRole('columnheader').count(),1);assert.deepEqual(errors,[])
 console.log('Artifact UI passed: automatic media, stale response, polling stability, retry, collapse, Office actions and icons')
}finally{await browser.close();server.close()}
