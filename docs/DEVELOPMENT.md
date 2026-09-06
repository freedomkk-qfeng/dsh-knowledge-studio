# Development and verification

This repository is an npm workspace. `lib/` contains maintained Host JavaScript alongside generated `client.js`, `pdf-runtime.js`, `pdfjs.js` and the shared video template. Do not clear `lib` during builds.

```sh
npm ci
python -m pip install -r packages/artifact-services/python/requirements.txt
# Set DSH_OFFICE_PYTHON to this interpreter's absolute path.
npx playwright install chromium
node scripts/prepare-test-runtime.mjs
npm run check
npm run test:ui
npm run test:host
npm run test:exports
```

Linux CI installs Chromium system dependencies with `npx playwright install --with-deps chromium`. `prepare-test-runtime` writes runtime paths to ignored `.dev-local/test-runtime.json` and, on GitHub Actions, exports them using `GITHUB_ENV`. Locally set the three variables in that JSON in the current shell before the browser checks; no private desktop runtime is assumed.

`check` covers types, builds, Node regression tests, LadybugDB P0, public-source auditing and both release tarballs. The documentation audit checks JSON examples, neutral business examples, and local Markdown links in both the source tree and each actual package archive. Cross-package or repository-only pages use full public GitHub links. UI suites exercise slow/failed media loading, stale responses, collapsible controls, reading mode and preserved draft state. `test:host` starts a real public DSH composition in a new temporary home, checks authenticated HTTP and Studio RPC, then stops its own process. It does not use an existing user's home or configured models.

`test:exports` creates actual report/slides PDFs, checks pages and text using pypdf, and extracts a JPEG poster with real FFmpeg. The same probe accepts `STUDIO_PACKAGE_ROOT` to verify an installed package. Isolated-dependency Node tests separately verify that Studio cannot resolve Remotion directly and that managed PDF/poster paths avoid browser preparation.

`npm run dev:web` starts a fresh isolated DSH home on an available loopback port and writes its authenticated URL to that home. Configure a model in that host when manually exercising generation. Stop it with Ctrl+C; existing homes and desktop installations are not touched. For long local checks, use a background runner that records PID, start time, stdout/stderr and a result file under ignored `dist/`.

Tests use synthetic materials. Raw local host logs may contain access URLs and must remain in the temporary home. Publish only reviewed, credential-free result summaries. CI uploads synthetic outputs under `dist/ui`, `dist/host`, `dist/exports` and `dist/packages`.

Cross-platform CI does not establish desktop installation, upgrade or rollback behavior. Real model quality, vendor TTS and user-data upgrades require deployment-specific acceptance.
