# DSH Knowledge Studio

[简体中文](README.md)

A workspace-native knowledge and creation studio for DeepSeek Harness, with optional local indexing, a browsable wiki, and AI-powered documents, learning tools, audio, and video.

Studio reads existing workspace files and uses the host's conversations and configured model. Reports, slides, tables, mind maps, quizzes, flashcards, audio overviews and video overviews work without first building an index or Wiki. Reading mode preserves the original conversation and draft; quizzes and flashcards keep progress. Infographics are out of scope.

## Packages

- **`@eduwork/dsh-knowledge-studio@0.4.0`**: workspace knowledge, Studio UI and saved artifacts.
- **`@eduwork/dsh-artifact-services@0.1.0`**: reusable Office, speech and media engines, eight dialogue tools and six generic skills. No Studio or institution dependency.

Studio requires the exact shared version, so install matching package versions. DSH **0.1.2-rc.1** and Node **22.19+ or 24** are the supported host baseline.

To install an npm-distributed version into an existing DSH Profile:

```sh
dsh plugin --profile web add @eduwork/dsh-knowledge-studio@0.4.0
```

To build from source:

```sh
npm ci
npm run build
npm run pack:release
```

Copy both archives from `dist/packages/` to the target Profile project, then install them together from that project:

```sh
npm install ./eduwork-dsh-artifact-services-0.1.0.tgz ./eduwork-dsh-knowledge-studio-0.4.0.tgz
```

See [usage and Profile activation](docs/USAGE.md). Loading the Studio bundle registers shared services once. Do not also activate a duplicate shared service or legacy Office plugin.

## Capabilities and runtime

Editable DOCX/PPTX/XLSX use the shared Python engine; PDF, CSV, HTML and Markdown are additional export formats. Audio/video output includes WAV/MP4, optional narration, captions, BGM and video previews. Speech providers share one application interface; Windows system speech is the included offline adapter, with locally installed voices. Other platforms need an extension provider for narration.

Provision Python 3.12+ with `packages/artifact-services/python/requirements.txt` and set `DSH_OFFICE_PYTHON` to its absolute interpreter path. Chromium may be prepared on first independent use or explicitly supplied by the deployment. No generation request installs Python dependencies.

Local search does not need embeddings or reranking services. Generation sends relevant material to the user's model and may incur model charges. Optional knowledge preparation requires consent. Office support is structural, not a full Office replacement; it does not add macros, tracked changes, formula calculation or animation editing. Captions use measured speech segments, not word-level alignment. Render only trusted editable React projects.

[Architecture and extension APIs](docs/ARCHITECTURE.md) · [Development](docs/DEVELOPMENT.md) · [Migration](docs/MIGRATION.md) · [Changelog](CHANGELOG.md) · [Releasing](https://github.com/freedomkk-qfeng/dsh-knowledge-studio/blob/main/docs/RELEASING.md)

Our code uses [MIT](LICENSE). Remotion, Chromium, PDF.js and other dependencies retain their own terms. See [third-party notices](THIRD_PARTY_NOTICES.md) and [BGM provenance](https://github.com/freedomkk-qfeng/dsh-knowledge-studio/blob/main/packages/artifact-services/media/BGM-USAGE.md).
