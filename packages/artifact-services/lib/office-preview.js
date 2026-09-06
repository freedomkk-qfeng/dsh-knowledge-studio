import {execFile} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {privatePython} from './office.js'

const MAX_OFFICE_SOURCE_BYTES = 64 * 1024 * 1024
const MAX_OFFICE_PREVIEW_BYTES = 24 * 1024 * 1024

export function assertOfficeSourceSize(size) {
  if (Number.isFinite(size) && size > MAX_OFFICE_SOURCE_BYTES) {
    throw new Error('Office 文件超过 64 MB，请使用本机应用打开')
  }
}

export function renderOfficePreview(filePath, signal, runtime = { execFile, environment: process.env }) {
  let python
  try {python=privatePython(runtime.environment)} catch(error){throw new Error('Office 预览运行时尚未就绪，请稍后重试',{cause:error})}
  if (typeof python !== 'string' || python.trim() === '') {
    throw new Error('Office 预览运行时尚未就绪，请稍后重试')
  }
  const args = ['-I', '-X', 'utf8', fileURLToPath(new URL('../python/runner.py',import.meta.url)), 'documents.render_preview', '--input', filePath]
  return new Promise((resolve, reject) => {
    runtime.execFile(python, args, {
      encoding: 'utf8', windowsHide: true, timeout: 45_000,
      maxBuffer: MAX_OFFICE_PREVIEW_BYTES, signal,
    }, (error, stdout, stderr) => {
      if (error !== null) {
        const detail = String(stderr ?? '').trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 800)
        reject(new Error(`Office 预览生成失败${detail ? `：${detail}` : ''}`))
        return
      }
      const html = String(stdout ?? '')
      if (!html.startsWith('<!doctype html>')) {
        reject(new Error('Office 预览运行时返回了无效内容'))
        return
      }
      resolve({ html, bytes: Buffer.byteLength(html, 'utf8') })
    })
  })
}

export { MAX_OFFICE_PREVIEW_BYTES, MAX_OFFICE_SOURCE_BYTES }
