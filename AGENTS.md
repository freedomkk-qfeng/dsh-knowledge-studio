# Development guidance

- This repository publishes two packages: Studio and the shared artifact services workspace.
- Target DeepSeek Harness 0.1.2-rc.1. Keep DSH service, permission and cancellation contracts intact.
- Most `lib/*.js` files are maintained source. Do not delete `lib`; only the client, PDF runtime and video template are generated.
- Studio works before optional workspace indexing/Wiki preparation. Preserve the current conversation, draft and saved learning progress.
- Keep package identity separate from persisted settings, data paths and plugin row IDs. Do not rename stored data when changing npm names.
- Runtime provisioning and institution-specific credentials belong to the deployment. Public code must work without private desktop paths or services.
- Run `npm run check`; use `npm run test:ui`, `npm run test:host` and `npm run test:exports` for relevant runtime changes. Keep outputs in ignored `dist/`.
- Release workflows default to packaging only. Publishing requires a maintainer's explicit action and configured npm trusted publishers.
