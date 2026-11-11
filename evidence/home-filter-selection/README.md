# Home filter selection

## Current state

The mounted OpenConductor regression reproduced three selection failures before the fix and passed all seven cases afterward with the same fixture bytes. Fresh main `e8fad6caae23b20ddd81196c54c293e0001accd6` has identical `AllWorkspaces` and `homeRows` source to the recorded baseline at `6be97d85b854b2a1bf7930db49e2227a26af2e6a`.

`AllWorkspaces` now tracks the selected date-group/workspace key and derives its current index. Removing earlier rows or reordering within the same group preserves selection and the Enter target. A removed row, empty list, changed date group, or changed query retains the source-backed reset behavior. Clicking a row selects and opens that row.

## Retained reference evidence

`source.json` carries exact offsets and span digests from the completed `ACQ-HOME-FILTER-01` packet. It does not repeat the original bundle analysis or claim a new verification pass.

Reference: Conductor 0.87.6, retained `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Parent REA evidence: `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.

The complete `UJo` declaration joins repository filtering and fixed date groups to `iJn` and `_Jo`, whose row key and command value are the workspace `localId`. The `KV` wrapper mounts an uncontrolled `Xyi` command root. Its `M5s` item registration chooses the first enabled row only if no value exists. Removing the selected item and changing search reset to the first enabled row. Filter changes have no separate reset, and same-route filter replacement has no configured remount key.

This predicts that a selected workspace keeps its identity when a repository filter changes without changing search or its date-group membership. The static source packet is not a mounted reference observation or visual parity proof. Its inherited REA semantic-renderer heap-exhaustion gap remains unchanged.

## Focused regression

The new `src/components/allWorkspacesSelection.test.ts` mounts production `AllWorkspaces` with real React hooks, `homeRows`, `groupByDate`, and row rendering. It drives the actual menu callbacks, keyboard handler, and click handler. Only unrelated desktop/archive I/O, preferences, agent status, shortcuts, icons, and tooltips are replaced. The retained reference JavaScript is not executed.

The same seven cases ran before and after the correction:

- A selected C survives filtering A, B, C to B, C. Its selected appearance and Enter target both remain C.
- Clearing the repository filter adds earlier rows without moving the selected workspace.
- Removing the selected workspace chooses the first remaining row and activates it.
- An empty filtered list selects nothing, does not activate on Enter, and chooses the first row when repopulated.
- A search change resets to the first row even if the old selection still matches.
- Clicking a different row activates that row, not the previous keyboard target.
- Reordering within one date group preserves identity. Moving the selected row to another date group resets to the first row.

## Executed verification

Both runs used this exact command on Reason Cloud 298, computer `2f55d343-d8e8-5df2-a012-bba9ca8cf476`:

```bash
NODE_OPTIONS=--max-old-space-size=384 nice -n 19 timeout --kill-after=5s 90s node --test --test-concurrency=1 src/components/allWorkspacesSelection.test.ts
```

- Baseline `86e4f1a979a9fff42f709c7cd7fd3e02e7c25fe4` failed as expected, with three assertion failures and four passing controls. The process exited 1 after 1.190 seconds. The first mismatch selected `Shared B` instead of surviving `Shared C`. These were component-behavior failures, not setup failures.
- The corrected component passed all seven cases. The process exited 0 after 1.158 seconds.
- Fixture SHA-256 before and after was `2d4ff9b2fd881e438d6d553d89e1bb024b0666298994afb8f2bad15595435e39`.
- The candidate component SHA-256 was `f9be6bc8124033ac7e7062b8d4b1a423286a7b86b58465d0258b049f5ca6f81f`.
- The isolated, lock-derived nine-package installation passed in 3.472 seconds with scripts disabled, no audit, no funding request, and no manifest or lockfile edits. It installed exactly the expected nine packages and used 26 MiB. No full repository install occurred.
- Both tests and the install terminated. No owned test, install, or typecheck process remained when the serialized slot was released.

[Baseline inputs](baseline.json), [exact installation](install.json), [baseline result](red.json), and [corrected result](green.json) record commands, digests, exit codes, and elapsed times. `install.log`, `red.log`, and `green.log` retain every output line with trailing whitespace normalized. Each receipt records the raw output digest. The durations describe these bounded runs, not a performance comparison.

Model the Domain determined the selected identity key. Laziness Protocol kept the correction inside the existing component without a new selection module.

## Verification limits

- Passed: fresh-main scoped comparison, frozen-fixture digest checks, the expected failing baseline, corrected seven-case regression, and `git diff --check`.
- Not run locally: broader related tests, typecheck, or build. Normal hosted CI owns those checks after publication.
- Not run: retained-reference mounting, browser, installed app, native reference, real process, or visual comparison. No screenshot is available because browser and native execution were excluded. React test-renderer proves the production component's synthetic callback/render behavior, not native or visual parity.
- No full dependency installation, native launch, shared ledger rewrite, or unrelated product edit occurred.
- The historical REA semantic-renderer heap-exhaustion gap remains unchanged. The retained full original upload was not placed in this recovered checkout, so this run reused the completed source packet rather than reacquiring or rehashing that upload.

Conductor Rebuild
