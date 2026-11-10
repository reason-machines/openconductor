# Local terminal startup body

Conductor Rebuild prepared this change from clean main `6725aad442a4423b710123bd958478b50117faf6` on `reason/openconductor-local-term-5fc196a7`.

## Retained reference evidence

The reference is the retained Conductor renderer `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The original artifact owner confirmed the complete function bodies against these half-open UTF-8 byte ranges.

- `Xwa`, `[11154184,11157364)`, exposes `isConnecting` for hook state `starting` or snapshot connection state `launching`.
- `eSa`, `[11160762,11165279)`, passes `launching = isConnecting && !isHandoffSessionActive && snapshot.connectionState !== spawn_error`. It renders `Zwa` only when visible.
- `Zwa`, `[11158521,11160762)`, handles unavailable first. Otherwise, `launching && !spawnError` renders the starting branch of `tCt`.
- `tCt`, `[11157454,11158521)`, returns `Starting terminal…` and a local or cloud icon for its starting branch. This change implements only the local branch.

The [complete retained receipt](https://reasonmachines.com/agents/1f14fa82-4ec3-41fc-b085-32ec441b4228) is source `0855e3d3-6ae8-4520-b135-4ca56ffb0dd7`, revision `25699810`. The complete `tCt` source is `617bc00c-0fb9-458a-b313-6d3fe9ed76ca`, revision `25614402`. These are static identity and text receipts, not runtime or native acceptance. This preparation did not acquire, extract, expand, or execute Conductor again.

Reinspection of [the historical synthetic starting capture](../lifecycle/reference-starting.png) shows a selected terminal tab with a blank body. It proves neither rendering of the startup body under the source predicate nor native absence. The [lifecycle README](../lifecycle/README.md) now states this limit.

## Product scope

`TerminalHost` takes the required `id` and `status` from `Pick<TerminalTab, "id" | "status">`. `PanelStrip` and the center-terminal caller in `WorkspaceView` pass the selected tab's existing status. No lifecycle store or subscriber was added.

Only `starting` declares the startup message and the existing local terminal icon. The `attachTab` effect, its `[id]` dependency, and the terminal mount remain present and unchanged. There are no failed-spawn, retention, retry, handoff, controller, provider, or cloud-terminal changes.

No stylesheet changed. The startup markup has no new placement rules. Its geometry, overlay behavior, colors, and same-build visual parity are unverified and are not claimed by this source increment.

## Actual-component regression contract

The CI-discovered test is [startingBody.test.ts](../../../src/features/terminal/startingBody.test.ts). It loads complete actual `PanelStrip`, `TerminalHost`, `FindBar`, and icon component sources, then renders with ReactDOMServer. State transitions use the real tabs reducer and helpers.

The fixture replaces only the terminal session boundary, the unrelated scripts panel, app preferences, and repository-settings callback. Any subscription, terminal attach, or IPC-like action throws. For the client-only `useSyncExternalStore` calls, an SSR-only React adapter supplies the same snapshot getter as the server snapshot. The real React hook and renderer still run. This checks render output, not mounted effects or browser subscriptions.

The contract covers these cases.

- A selected starting panel terminal exposes `Starting terminal…` with a status role and local icon.
- Selected running and exited terminals do not expose the startup body.
- A closed strip, Setup, Run, and a strip whose final terminal was closed do not expose the startup body.
- A selected running terminal does not inherit a starting sibling's state. Selecting the starting sibling exposes its body.
- Direct actual center `TerminalHost` starting, running, and exited controls retain the terminal mount. Center-only tabs do not produce a panel startup body.

The direct center controls do not claim a whole `WorkspaceView` render, native PTY, or mounted attach behavior.

Normal hosted CI discovers the file through `node --test "src/**/*.test.ts"`. The focused command, once prerequisites and capacity are admitted, is `node --test src/features/terminal/startingBody.test.ts`. An isolated dependency prefix can be selected with `TERMINAL_SSR_DEPS` without changing product code.

## Verification at source preparation

- Passed: `git diff --check` on the prepared production diff.
- Not run: actual-component RED then GREEN, TypeScript transpilation, syntax execution, typecheck, build, app, server, browser, native, and provider checks. React and ReactDOM are absent in this checkout, and local dependency installation plus runtime capacity have not been admitted.
- Not run: containing-main package identity or installed-package behavior. No package or native acceptance is claimed.
- No new screenshot or recording was captured. Only the historical image linked above was inspected.

The minimum proposed isolated runtime dependencies are `react@18.3.1`, `react-dom@18.3.1`, and `typescript@5.9.3`, matching the root lockfile. A 50 MiB installed dependency budget, one Node process, and a 60-second focused check were requested through the central ledger. That budget is an estimate, not a measured footprint or execution admission.
