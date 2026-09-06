# Shared artifact services

Host-independent Office, speech and media implementations, with an optional DSH tool adapter. Studio and dialogue tools consume these components; neither component imports Studio, its knowledge index, an institution login or a desktop shell.

Version: `@eduwork/dsh-artifact-services@0.1.0`. Studio `0.4.0` requires this exact separate package. To use the shared services without Studio, install this package in the consuming Node project; DSH tool consumers also need a compatible DSH host. See [architecture and deployment](https://github.com/freedomkk-qfeng/dsh-knowledge-studio/blob/main/docs/ARCHITECTURE.md) and [source build instructions](https://github.com/freedomkk-qfeng/dsh-knowledge-studio/blob/main/README.en.md).

PDF/video consumers in Node can import `createMediaRuntime` from `@eduwork/dsh-artifact-services/runtime` and use its `browserExecutable`. Supply `DSH_MEDIA_NODE_ENV` / `DSH_MEDIA_BROWSER` together for a pinned deployment (legacy `ECNU_AGENT_NODE_ENV` / `ECNU_AGENT_REMOTION_BROWSER` remain supported); configured deployments never call `ensureBrowser`. Without configuration, the shared package prepares its own browser. `getMediaFFmpegPath` from the same entry resolves FFmpeg from the selected dependency owner without preparing a browser. An existing runtime can be passed as `{runtime}`.

## Application interfaces (v1)

```js
import {SpeechService, createSystemSpeechProvider} from '@eduwork/dsh-artifact-services/speech'
const speech = new SpeechService()
const dispose = speech.register(createSystemSpeechProvider()) // Windows adapter
const catalog = await speech.list()
const file = await speech.synthesize({
  provider: 'system', voice: catalog[0].voices[0].id, text: 'Hello.', speed: 1,
  directory: applicationOwnedDirectory, name: 'preview-1', signal,
})
// file: {path, format:'wav', duration, provider, voice, text}
dispose()
```

Every provider uses the same `voices()` and `synthesize(request)` contract. Register another provider without changing application calls:

```js
speech.register({
  id: 'my-tts', title: 'My speech service', local: false,
  voices: async () => [{id: 'narrator', title: 'Narrator', language: 'zh-CN'}],
  async synthesize({text, voice, speed, directory, name, signal, execution}) {
    // Obtain credentials/permission through your host adapter. Use the exact
    // text, observe cancellation, save a real WAV in an authorized location.
    return hostSpeechAdapter.synthesize({text, voice, speed, directory, name, signal, execution})
  },
})
```

`execution` is optional, ephemeral host context. Never serialize it or send it to the browser. Voice/provider errors remain errors: no automatic fallback to another voice, local engine or vendor. Returned duration is measured from WAV bytes, ignoring vendor duration estimates. This version requires WAV at the provider boundary; conversion from a vendor's native format belongs in that adapter. Word timing is not promised; current captions synchronize exact synthesized segments.

The same registry is available to DSH extensions as `ctx.artifactServices.registerSpeechProvider(provider)`. Both Studio and `speech_synthesize` use that registry. The ChatECNU adapter calls the existing governed `ecnu_tts_generate`; its HTTP and credentials stay with the institution tool. The campus voice catalog has one source in that tool package.

```js
import {runOffice, normalizeOfficeRequest} from '@eduwork/dsh-artifact-services/office'
const result = await runOffice({projectPath: workspaceDirectory, signal,
  environment: {...process.env, DSH_OFFICE_PYTHON: managedPythonPath},
  request: normalizeOfficeRequest('document', {
    action: 'create', output_path: 'report.docx',
    spec_json: JSON.stringify({blocks:[{type:'paragraph',text:'Hello.'}]}),
  }),
})
```

Office preserves the previous document and spreadsheet edit actions, inspection/validation, presentation layouts, PDF create/merge/extract, and HTML previews. Presentation specs accept `speaker_notes`; spreadsheet create/edit/append support `{type:'text',value:'=literal'}` and `{type:'formula',value:'=SUM(A1:A2)'}`. Ordinary scalar strings retain legacy formula behavior. Formula validation does not calculate values. `renderOfficePreview()` is a bounded structural HTML preview, not a pixel-exact Office render.

Configure a Python interpreter containing `python/requirements.txt` through `DSH_OFFICE_PYTHON`. The legacy `CHATECNU_WORK_OFFICE_PYTHON` variable remains accepted. The isolated interpreter runs this package's bundled Python source, not separately maintained installed `ecnu_agent_*` scripts. Dependency provisioning is an explicit deployment step; no generation request installs software. Optional school assets are supplied with `DSH_OFFICE_BRAND_ASSETS`; none are bundled here.

```js
import {renderMedia} from '@eduwork/dsh-artifact-services/media'
import {createMediaProviders} from '@eduwork/dsh-artifact-services/providers'
const providers = createMediaProviders()
const result = await renderMedia({id:'overview',kind:'video',title:'Overview',
  segments:[{heading:'One idea',bullets:['A short point'],narration:'One idea.'}],
  options:{provider:'system',voice:'installed-voice',narration:true,subtitles:true,aspect:'16:9'},
}, applicationOwnedDirectory, signal, onProgress, providers, hostContext)
```

Structured audio/video and editable Remotion projects use `lib/remotion.js`. The editable runner retains source editing, staging, integrity-bound voice jobs, full validation, covers and quality-review frames. `runVideoCommand(command, options, runtime)` is its callable API; `createMediaRuntime()` resolves the component's own dependencies. A deployment can instead inject its verified managed runtime. Old CLI environment checks remain for legacy launchers.

## DSH composition

Load `@eduwork/dsh-artifact-services/dsh` once. It provides `artifactServices`, six generic skills and these tools:

| Tools | Responsibilities |
| --- | --- |
| `office_document`, `office_spreadsheet`, `office_presentation`, `office_pdf` | Existing Office tool names and workspace-relative paths |
| `speech_voices`, `speech_synthesize` | Provider/voice/music discovery and speech generation |
| `media_render` | Structured audio/video generation |
| `video_project` | Editable project init/staging/voice jobs/validation/rendering |

Do not also register the legacy `tool-office` plugin. Keep permissions, credentials and publication in DSH. Tool adapters pass cancellation and original execution context to nested vendor tools. Config `{skills:false}` allows an assembly to manage generic skill registration itself. `{bgmRoot}` selects an alternative verified catalog; default is the included six-track library.

## Assets, builds and compatibility

- Six instrumental BGM cues include score JSON, deterministic synthesis code, WAV files and hash/level/loop metadata. See `media/BGM-USAGE.md`.
- `templates/structured` is the structured video source. `templates/editable` is the modifiable starter project. Different templates share the renderer; they are not separate render engines.
- No third-party audio samples or school logos are included. Remotion keeps its own license.
- Office operations remain limited to supported OOXML/PDF features; macros, tracked changes, animation editing and formula calculation are not added by this migration.
- Tests require a configured Python runtime. The parent repository runs Office editing/preview/validation, provider contracts, music integrity, original video-runner regressions and browser checks.
