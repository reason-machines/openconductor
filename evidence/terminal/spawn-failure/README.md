# Failed terminal creation stays retryable

Conductor Rebuild traced this contract from retained Conductor JavaScript, then compared it with main `26ba01a1857a425780252abe3d28aa4eb9ba9572` before changing product code. This is static source evidence, not observed native behavior.

## Retained source identity

The original acquisition is REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Both complete assets were rehashed locally. No reference JavaScript was evaluated.

- `renderApp-D_fmY7hW.js` has 11,600,457 bytes and SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js` has 3,493,297 bytes and SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

[The packet](reference.json) contains 44 retained spans, their hashes, full declaration boundaries, immediate callers, import/export joins, visible state binding, and limitations. Offsets are zero-based UTF-8 byte half-open ranges, not JavaScript UTF-16 positions or historical Python character offsets. The `.txt` files are untrusted reference data and must not be executed.

## Rejection, retention, and Retry

Renderer `qc` imports index `gh`, which exports `ts=DAt()`. That constructor returns the `$kt` terminal runtime. Index's unrelated `qc` export is not this runtime.

`$kt.createSession` registers a `V9` controller before starting it. A cold-history lookup rejection deletes the controller. In contrast, a backend creation rejection reaches `V9.spawnBackendSession`, which sets `spawn_error` through `FSt`, disables input, emits the snapshot, and rethrows. The enclosing runtime catch emits but does not delete that controller.

`Xwa` catches the rejection and reads the retained runtime snapshot. `eSa` passes the snapshot's `canStartShell` to `Zwa`. Its error state reaches `tCt`, which renders the failure message and a Retry button disabled when retry is not permitted. Retry calls `qc.restartShell(w)` with the existing runtime id. `V9.restartShell` permits only interactive sessions in `spawn_error`. `PSt` changes the state to launching and disables retry until another failure or readiness notification.

The terminal store is also closed through the matching import. `Sh` imports index `gl=yo`, whose methods use `Ns`. That store creates a terminal record separately from runtime creation. `Tde` cleans runtime and display registrations after terminal-map removals. The inspected spawn-error path does not remove the record.

The visible local caller chain is `nro`, `Jio`, `d1e`, `xEi`, `lSa`, `eSa`, and `Xwa`. It carries the terminal id through the interactive display config. Full declarations are retained, including the caller's access and visibility branches.

The id distinction matters. The local backend allocates a proposed PTY id for each creation attempt and sends it separately from the terminal id. Same runtime id on Retry does not mean native PTY reuse.

## Current-main counterexample and correction

On the checked main commit, `startTab` disposes the terminal and closes its tab when spawn rejects. It also forgets a restored tab's history. No failed state or Retry control exists.

A later fetch resolved main to `6be97d85b854b2a1bf7930db49e2227a26af2e6a`. The terminal implementation, its panel and workspace callers, and the OpenConductor PTY command and manager were unchanged from the compared commit.

The correction retains the tab, screen, launch settings, and saved history. The existing reducer gains explicit failed and retry events. Retry uses the retained id and launch settings and is admitted only from `spawn_error`. The failed terminal disables input. Center tabs announce registration before asynchronous creation completes so a failed center terminal remains reachable.

The existing startup overlay, resource-label enumeration, shell environment, localhost behavior, and locked tests are unchanged. A getter supplies the retained error to `TerminalHost`, so no caller changes are needed in the shared workspace or panel components. This follows Model the Domain by keeping lifecycle transitions in the existing reducer instead of a second retry-status store.

## Verification

- **Passed, expected failure before the correction.** The final seven-test regression file was copied unchanged into an isolated source snapshot of main `26ba01a`. All seven tests failed, including `failed terminal remains registered`, the missing Retry method, and restored-terminal retention.
- **Passed after the correction.** `node --experimental-strip-types --test src/features/terminal/*.test.ts src/components/resourceUsageLabels.test.ts` passed all 94 tests. This includes the actual session source and React component with mocked PTY, DOM, and xterm boundaries. The pre-existing startup, restore, input, tab-list, and resource-label tests were not edited.
- **Passed.** `npm run typecheck` completed without diagnostics.
- **Passed.** `python3 evidence/terminal/spawn-failure/verify.py --originals .oc-tmp/vio-received-72733982/originals` rehashed both complete assets and matched all 44 spans against their exact original byte ranges.
- **Passed.** `git diff --check` reported no whitespace errors.
- **Passed.** `node scripts/check-colors.mjs` reported no color literals outside the theme and no hue under Neutral.

Run `python3 evidence/terminal/spawn-failure/verify.py` without original assets to verify the committed spans and binding assertions only. That mode does not rehash the complete original assets.

## Remaining boundaries

No browser, native app, shell, provider, install, build, E2E run, or screenshot was launched for this change. Visual and installed-app acceptance remain unverified because this lane has no runtime admission.

The exact uninspected native boundary is Conductor's `pty_spawn` handler and its native error-cleanup and process-registration callees. Native acquisition must go through the sole native executor. These are not needed to establish the JavaScript runtime's retained-controller contract, and no native survival or PTY-reuse claim is made.

The original acquisition packet records an earlier semantic-renderer heap exhaustion. No REA MCP operation is exposed in this continuation. The analysis therefore uses the retained REA-acquired bytes and ordinary static module parsing, not a new analyzer or native probe.
