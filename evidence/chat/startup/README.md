# Workspace startup readiness

Conductor Rebuild, 2026-11-06. This is an OpenConductor lifecycle contract, not a new claim about Conductor. No visible layout changed.

## Contract

The normal app shell exposes `.app[data-startup]` and `aria-busy`.

- `loading`, `aria-busy="true"`: the active initial repository/workspace or sidebar-section database read is outstanding.
- `ready`, `aria-busy="false"`: both reads succeeded and their state updates were dispatched. Browser shell state is synchronous and starts ready.
- `error`, `aria-busy="false"`: at least one initial read failed. The other read can still populate its part of the UI. Errors remain in Diagnostics console logs.

Wait for `.app[data-startup="ready"][aria-busy="false"]` before choosing a workspace, and fail explicitly on `data-startup="error"`. This does not promise that a transcript has finished restoring, agent binaries are ready, or an animated target has settled. Those have their own observable conditions. Settings and onboarding do not render the normal shell.

Cancelled effect instances cannot dispatch their initial database snapshots or change readiness. This covers the first development StrictMode effect and an unmounted shell. No reload or click retries were added.

## Reported failure and limits

The [native five-pass job](https://github.com/reason-machines/openconductor/actions/runs/42301712680/job/128180871235) passed three relaunches, then failed pass 4. Its completed log at line 3095 says `timed out waiting for e2e to be the open workspace; last: false`, at `openWorkspace`, not at the later transcript assertion. [Artifact 13543539873](https://github.com/reason-machines/openconductor/actions/runs/42301712680/artifacts/13543539873), `pass-4/failure.png`, shows the fork selected and the original row visible. No successful original selection was observed. This does not establish an overwritten navigation.

Before this change, a real App/store browser fixture held the first StrictMode workspace read, allowed the second read to finish, selected the original, then released the first with the same rows. Selection stayed original. The reported overwrite was not reproduced. The shell had no ready attribute: checking it threw `Missing observable startup-ready state: undefined`.

This change delivers the requested alternative, an observable data-loading gate. It is not proof that the native WebDriver click failure is fixed. The E2E owner retains that harness and must rerun the relaunch flow. No real Mac application, playground, or bergen data was touched.

## Checks

- `npm run typecheck`: passed.
- `node --test "src/**/*.test.ts"`: passed, 1,252 tests, zero failures.
- `git diff --check`: passed.
- `node --check tools/chat/startup.browser.mjs`: passed.
- `node tools/chat/startup.browser.mjs http://127.0.0.1:4179`: passed, six isolated browser checks. See [checks.txt](checks.txt). Start Vite through the supported preview lifecycle first; on a network-isolated cloud machine run Vite and this command inside the same preview command. The script starts no server.

The browser check holds real App/store IPC reads through the existing test backend, verifies busy before both reads finish, checks navigation, releases a cancelled read missing the selected workspace, verifies an error is not ready, and continues through onboarding in an isolated plain-browser context. It does not use the fake-ACP harness.

Not run locally: native Tauri build, native WebDriver relaunch, real Reason/Claude/Codex sessions, new Conductor side-by-side capture. Existing compact-footer evidence remains in [responsive](../responsive/README.md). Native workspace/chat and usage-footer parity remain unverified.
