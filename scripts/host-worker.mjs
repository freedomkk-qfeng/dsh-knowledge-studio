import {fileURLToPath,pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
process.env.DSH_HOME=resolve(process.argv[2])
process.env.DSH_TELEMETRY_DISABLED='1'
process.on('message',message=>{if(message==='stop')process.emit('SIGTERM')})
const bin=fileURLToPath(new URL('../node_modules/@deepseek-ai/dsh/lib/bin.js',import.meta.url))
process.argv=[process.execPath,bin,'--profile','studio','--host','127.0.0.1','--port',process.argv[3],'--no-open']
await import(pathToFileURL(bin))
