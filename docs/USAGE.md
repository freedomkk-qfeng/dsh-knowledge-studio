# Usage

## Runtime requirements

Use Node 22.19+ or 24 and DSH 0.1.2-rc.1. Enable optional npm dependencies so LadybugDB can select its native platform package. Windows x64 and Linux x64 are CI targets; other listed native platforms are not yet covered by this project's CI.

The two package versions are coupled: Studio 0.4.0 requires Artifact Services 0.1.0. When installing from locally built archives, supply both tarballs in the same npm install. Do not use `--force` or `--legacy-peer-deps` to resolve a mismatched DSH host.

After installing into a Profile project, add `@eduwork/dsh-knowledge-studio` to its existing `dsh.profile.bundles` list without replacing other entries. The bundle patch registers `@eduwork/dsh-artifact-services/dsh` and Studio. Restart the host. A custom assembly that registers these services itself must not also activate a second Studio bundle.

## Office

Provision Python and the shared package's requirements explicitly:

```sh
python -m venv .venv
.venv/bin/python -m pip install -r packages/artifact-services/python/requirements.txt
export DSH_OFFICE_PYTHON="$PWD/.venv/bin/python"
```

On PowerShell:

```powershell
python -m venv .venv
& .venv/Scripts/python.exe -m pip install -r packages/artifact-services/python/requirements.txt
$env:DSH_OFFICE_PYTHON = (Resolve-Path .venv/Scripts/python.exe).Path
```

For an npm installation, the requirements file is under `node_modules/@eduwork/dsh-artifact-services/python/requirements.txt`. Production generation uses this package's bundled Python source. Optional presentation branding is supplied via `DSH_OFFICE_BRAND_ASSETS`; no school assets are required.

## Browser, speech and BGM

Independent PDF/video rendering prepares Remotion's Chromium if needed. For a pre-provisioned or offline deployment, set **both** `DSH_MEDIA_NODE_ENV` (absolute directory containing package.json and node_modules) and `DSH_MEDIA_BROWSER` (absolute Chromium executable path). The environment must contain the pinned Remotion 4.0.520 modules and React/React DOM 18.3.1. With explicit configuration the service never falls back to downloading a browser. Video posters use FFmpeg from the selected media dependency owner without preparing a browser.

Windows System.Speech supplies the included local adapter. Voices depend on installed OS voices; other platforms require an extension provider for narrated media. Unavailable providers remain unavailable instead of silently changing the requested voice. Videos can omit narration and BGM. Six lightweight BGM loops are included; they may be extended through the shared registry.

## Workspace flow

Open a workspace in DSH, then use the Studio controls in the conversation or details panel. Choose a source scope, output type and parameters. Reports, slides and tables produce editable files; sources and scripts are secondary, collapsible details. Quizzes and flashcards save interaction state.

Knowledge preparation is optional and explicitly confirmed. It builds a local index and model-written Wiki. A failed or interrupted preparation does not block basic Studio generation. Reading mode provides chapter navigation and temporarily expands into the conversation area while preserving its draft.

Local search stays on the machine; model-written artifacts send necessary material to the configured model. Host permissions and configured provider policies still apply.
