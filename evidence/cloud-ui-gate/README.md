# Cloud UI opt-in

Sven's explicit OpenConductor scope decision. This is not a new Conductor parity claim. Existing reference evidence remains in `evidence/org/NOTES.md`, `evidence/settings/NOTES.md` and the Routines evidence. No new REA operations or gaps were needed.

## Behavior

One setting, **Settings > Experimental > Cloud UI (experimental)**, stores `experimental_cloud_ui` through the existing table-preference service. Missing, false or invalid values are off, including an existing account with a saved organization and signed-in Reason CLI. Only boolean true opts in.

Off hides Routines, the account organization switcher, organization/Admin settings and Cloud setup. It blocks `/routines`, legacy `/automations`, organization/cloud settings URLs, legacy settings `?tab=` targets and in-app settings navigation. Turning it off also leaves an already-open Routines page. The code remains present. Opt-in restores existing availability rules, including Reason sign-in for the Routines row and personal-account Cloud setup.

Team and triage have no independent built entry point on this base. The palette already excludes them and Routines, and its settings index excludes Cloud setup/organization pages. The browser check asserts that they stay absent rather than adding new opt-in UI.

Reason sign-in, agent settings, local workspace/session management and Reason runtime selection are not gated. No agent/runtime/backend implementation was changed.

## Observed proof

Base source `8e847380955088974ea268690a94581c45791264` showed Routines and Demo team without opt-in. `screens/before-default.png` records that reproduction in a local Vite preview before the gate changes. The final captures are from the production frontend build served by Vite preview.

The browser uses a new disposable Playwright context and synthetic IPC responses for Ada Demo, a signed-in Reason CLI and Demo team. Its settings writes persist only in that test context's localStorage fixture. It makes no authenticated Reason requests, touches no real home/database and does not drive a Mac.

- `screens/after-default.png`: no Routines; the local Mac identity replaces the stored team.
- `screens/experimental-opt-in.png`: the explicit switch.
- `screens/after-opt-in.png`: Routines and the stored team return after a new document load.

## Checks

- `npm run build`: passed, including TypeScript; existing bundle-size warnings remain.
- `node --test "src/**/*.test.ts"`: 1,252 passed, zero failed.
- `node --test src/settings/cloudUI.test.ts src/settings/routes.test.ts src/settings/prefs.test.ts`: 19 passed.
- `npm run lint:colors`: passed.
- `RUSTUP_TOOLCHAIN=stable bash evidence/cloud-ui-gate/run-rust-tests.sh`: five actual settings table-preference tests passed, including absent-existing-value and explicit true/false round-trip; focused-source clippy passed with warnings denied.
- `git diff --check`: passed.
- `CLOUD_UI_SCREENSHOTS=evidence/cloud-ui-gate/screens node tools/settings/cloud-ui-preview.mjs`, launched through Reason's preview-start tool after the build: passed. It verifies default-off with a saved org and signed-in Reason, account menu absence, toggle persistence across document loads, restored organization Members routes, restored personal Cloud setup, disabled direct/legacy Routines and settings routes, palette absence and the retained Reason agent settings.

The browser test accepts `CLOUD_UI_BASE_URL` to use another existing server. Without it the general browser suite skips this dedicated check. `CLOUD_UI_BEFORE=1` is a reproduction-only mode that expects the old Routines visibility.

## Limits

No native macOS build, installation or signed-in Mac/cloud chat was run here. Browser IPC is a controlled fixture, not live service integration. The desktop table-pref read/write codec is covered by real Rust source tests; actual app SQLite persistence and the full Tauri app checks remain CI/native checks.

The pre-existing broad settings harness fails to compile because it lacks current service dependencies. Tracked separately as [#720](https://github.com/reason-machines/openconductor/issues/720); not repaired in this scope. The focused Rust script imports the real `model.rs` and `table_prefs.rs` and does not weaken that harness.
