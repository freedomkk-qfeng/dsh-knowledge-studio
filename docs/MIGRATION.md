# Migration and assembly

Back up a Profile's configuration before switching its installed plugin identities. Replace old unscoped module names in `dependencies`, `dsh.profile.bundles` and hand-written Cordis `name` paths with `@eduwork/dsh-knowledge-studio` and `@eduwork/dsh-artifact-services`. Keep configuration, Cordis row IDs and user data unchanged. Do not enable old and new bundles together. Restart the host so client loader and RPC package identities move together.

Studio 0.4.0 and shared services 0.1.0 target DSH 0.1.2-rc.1. A deployment must supply both packages with their locked dependencies. It should register `artifactServices` only once and retire duplicate Office executors. If the deployment manages its own skill settings, use shared config `{skills:false}` and expose the six generic skills from that package.

Institution adapters need only register speech/BGM and forward governed calls through their host tools. They own credentials, vendor HTTP and institutional assets. They should not copy Python engines, Remotion code or timelines. Standalone use needs none of these institution adapters.

The `dsh-knowledge-studio` settings namespace, knowledge and artifact directories remain unchanged. Historical `.ecnu-agent/video-projects` files, template identifiers and Office generator markers remain readable. New video starters use WAV, a discoverable provider voice and user-supplied branding. Old audio bindings retain their existing format checks.

Memory is independent and optional. This migration introduces no Studio/Memory dependency.

Source compatibility and synthetic tests do not assert that an existing user's Profile has already been migrated. A consuming product must validate installation, old sessions, saved artifacts, permissions, update and rollback with its actual package set.
