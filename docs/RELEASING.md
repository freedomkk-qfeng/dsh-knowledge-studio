# Release the two npm packages

This repository produces two public packages from the same reviewed commit:

| Package | Manifest | Release tag |
| --- | --- | --- |
| `@eduwork/dsh-artifact-services` | `packages/artifact-services/package.json` | `shared-v<version>` |
| `@eduwork/dsh-knowledge-studio` | `package.json` | `studio-v<version>` |

The versions documented here are shared services `0.1.0` and Studio `0.4.0`, targeting DSH `0.1.2-rc.1`. Studio pins the exact shared version. The npm workspace supplies that dependency during development and CI, including before its first registry publication. Neither package requires the Memory plugin or an institution-specific deployment.

## Publication prerequisites

Each package needs its own npm trusted publisher connection. Check the registry and publisher settings before a release; do not infer them from another package's configuration. A passing build, uploaded tarball, GitHub commit, or successful release dry run does not mean npm publication succeeded.

The integration maintainer coordinates the initial release and browser/CLI 2FA. Do not add a long-lived npm token to GitHub secrets. Do not use `--force` or `--legacy-peer-deps` to bypass dependency errors.

## Check and inspect a candidate

1. Update both relevant manifests, the root `package-lock.json`, changelog, and installation instructions together. Keep `dependencies["@eduwork/dsh-artifact-services"]` equal to the shared manifest version. Use stable versions without `alpha` or `dev`.
2. Commit the reviewed public source. Ensure no private configuration, machine paths, credentials, or development history is included. CI runs on Windows with Node `22.19.0` and Linux with Node `24`, with Python `3.12` and a test Chromium.
3. Require the exact commit's **CI** workflow to pass both jobs: type checking, build, Node tests, P0 checks, public-package audit, packaging, three browser UI suites, an isolated DSH host check, and real PDF/video-poster exports. An earlier commit's CI is insufficient. These checks do not certify every external model/provider or desktop upgrade path.
4. Run **Release candidate** manually with `ref` set to the exact commit and `publish=false` (the default). Select `shared` or `studio`; either choice builds and checks both packages. A tag is optional for this build-only run. If provided, it must match the selected manifest and point to that commit.
5. Download `release-packages-<run-id>-<attempt>`. Inspect both tarballs, `packages.json`, and `release-gate.json`, including package contents, source commit, SHA-256, and SHA-512 integrity. The tarballs are named `eduwork-dsh-artifact-services-<version>.tgz` and `eduwork-dsh-knowledge-studio-<version>.tgz`. The gate record binds the package bytes to this workflow run; it is not an npm publication receipt.

Local checks use `npm ci`, the Python requirements in `packages/artifact-services/python/requirements.txt`, `node scripts/prepare-test-runtime.mjs`, `npm run check`, `npm run test:ui`, `npm run test:host`, and `npm run test:exports`. Set `DSH_OFFICE_PYTHON` to the absolute path of the Python interpreter containing those requirements. The runtime preparation script selects the same Chromium for browser and shared-media checks; CI exports its selection through `GITHUB_ENV`.

## Bootstrap each package, then configure OIDC

The npm trusted publisher settings are attached to an existing package. For a package not yet present in the registry, the integration maintainer first publishes the inspected tarball using an authenticated npm CLI and the required interactive 2FA. Publish **shared services first**, verify that exact version in the public registry, then publish Studio. Use the inspected archive as the publish input; do not run an unreviewed directory-based publish. When bootstrap occurs outside CI, do not claim GitHub OIDC provenance; the maintainer should explicitly disable provenance for that local invocation if necessary.

After each package exists, configure its npm **Settings → Trusted publishing** separately:

| npm setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `freedomkk-qfeng` |
| Repository | `dsh-knowledge-studio` |
| Workflow filename | `release.yml` |
| Environment | Leave empty; this workflow does not select a GitHub environment |
| Allowed actions | Enable direct `npm publish` for this workflow |

New publisher configurations currently default to staging-only permission. This workflow uses direct `npm publish`, so a staging-only connection will not authorize it. If the project chooses staged publication later, update and review the workflow and approval process together. A saved connection is not proof that it works; validate a subsequent authorized publication and its registry provenance before describing OIDC as operational. See the [npm trusted publisher setup and requirements](https://docs.npmjs.com/trusted-publishers/).

GitHub-hosted runners, Node `>=22.14.0`, and npm `>=11.5.1` are required for npm trusted publishing. This project requires Node `>=22.19.0`; the publish job uses Node `24`, installs npm `11`, and checks its minimum version. Only the publish job has `id-token: write`; the build job has read-only repository/Actions permissions. No long-lived npm credential is passed to either job.

## Subsequent trusted-publisher releases

1. Finish integration approval and the exact commit's successful CI. Create and push the selected package's tag as a deliberate maintainer action; the workflow never creates tags. Use `shared-v0.1.0` or `studio-v0.4.0` for the initial version labels, and the corresponding new manifest versions for later releases. Never move a published release tag or reuse an npm version.
2. Run **Release candidate** from the source repository with `publish=true`, the selected package, the reviewed `ref`, and its exact existing tag. In **Run workflow**, select a workflow branch/tag resolving to that same commit; the source `ref` input alone does not change the workflow's `GITHUB_SHA`. The gate requires both commits to match because [npm's provenance records `GITHUB_SHA`](https://github.com/npm/cli/blob/latest/workspaces/libnpmpublish/lib/provenance.js). This is the explicit publication action. The gate also rejects forks, missing or mismatched tags, changed maintained source, version-lock mismatches, and commits without a successful source-repository CI run.
3. The workflow reruns the checks, records hashes, and uploads the exact tarballs. Its publish job checks out the recorded commit, downloads that same workflow's artifact, repeats the tag/CI/version checks, and verifies both archives against the recorded hashes. It does not rebuild the archive or run package lifecycle scripts during publication.
4. For Studio, the gate requires its exact shared dependency to exist in the public npm registry. If both versions change, release and verify shared services first, then dispatch Studio separately. A local workspace is sufficient for checking candidates, but it cannot satisfy this publication prerequisite.
5. Inspect the npm result and registry package metadata/provenance. Record the GitHub commit, CI/release run URLs, versions, archive hashes, and registry integrity in the integration release notes. Publishing is immutable; a failed or uncertain upload must be checked against the registry before retrying. The workflow does not update any existing Web instance, user home, or desktop installation.

The gate uses the [GitHub workflow-runs API](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow) to check the exact source commit. Protect the release workflow and release tags through normal repository review/rules; a fork's pull-request success is not an eligible publication gate.
