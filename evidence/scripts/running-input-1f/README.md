# Running-script terminal input

Owner: Conductor Rebuild SAME1f. This increment concerns Run output only. It does not change Setup, Spotlight, provider terminals, overflow chips, or the general terminal protocol.

## Reference and baseline

The retained REA evidence is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. `receipt.json` records the original assets, UTF-8 ranges, and hashes for 14 retained spans. `reference/rSa.txt` derives both `disableStdin` and `disableInput` from the task's running state. The renderer subscribes `terminal.onData`; the runtime checks its running/input-enabled state and forwards to the local backend's `pty_write`.

The native implementation behind Conductor's `pty_write` was not recovered by this inquiry. These are shipped JavaScript source findings, not observations of native interaction.

The eight baseline files in `current/` were captured at `5653e04fa90f11cb0d387f40f8eaed5660085746`. `fresh-main.json` verifies that all eight remain byte-identical at `15e87440daa703030f4c402e7a41b9221a149768`. The baseline creates an xterm with input disabled, passes only output to it, and exposes no script-write command. The script launcher gives the PTY master to its output reader without retaining an input writer.

Source verification passed on Reason cloud:

```bash
python3 evidence/scripts/running-input-1f/verify.py --original-dir .oc-tmp/scripts-audit-1222/originals
```

Result: two complete original asset hashes, 14 spans, and eight baseline files verified. The original asset directory is retained locally and is not part of this change.

## Frozen behavioral regression

`fixture.sha256` seals `src/scripts/runningInput.test.ts` before the product repair. The fixture mounts the production `ScriptsPanel`, `ScriptOutput`, and scripts API. It substitutes the native IPC endpoint and xterm event source, not those production components.

The seven cases exercise exact typed and pasted bytes, workspace/script/run identity, read-only stopped output, stopping and rerun transitions, workspace switches, unmount cleanup, and the unchanged read-only Setup path. A legacy running status without a run identity must remain read-only.

The intended failing assertion is the missing input at the IPC endpoint after input events on the displayed running terminal. A loader failure or missing API error does not establish that behavioral failure.

Automatic hosted command:

```bash
node --test src/scripts/runningInput.test.ts
```

Hosted baseline RED was observed at `a6f37310223722dfbd7ae208c9a9e958a1e0af93` in CI run `43110308365`, frontend-unit job `130824242774`. The normal full-suite command `node --test "src/**/*.test.ts"` executed 3,116 tests: 3,113 passed and exactly three failed. All three failures were the frozen live-input assertions (exact bytes, run transition and displayed workspace); actual IPC writes were empty. All four frozen read-only/cleanup controls passed. The typecheck step passed; the named frontend build job failed at the same unit-test step, before build.

`baseline-red.json` records the exact head and counts; `baseline-red.log` retains the decisive log excerpt. The seven-case fixture remains byte-identical for candidate GREEN. No local Node, Rust, app, native, or provider runtime was started.

## Candidate and additional coverage

The candidate passes xterm input through the production panel/API and a script-specific Tauri command to a retained live PTY writer. Admission requires the current workspace, script and run ID; it captures that Process before writing, never looks up a replacement after validation, and releases the retained writer on exit. The frontend serializes input and drops queued bytes when its input subscription is replaced or disposed. Setup and Spotlight stay read-only.

`src/scripts/inputOrdering.test.ts` adds four queue/baseline controls. `crates/scripts/tests/running_input.rs` adds four Unix integration cases for exact real-PTY consumption, previous-generation rejection, setup/stopped rejection and separate-workspace routing. Both additions are published for automatic hosted execution; no passing result is claimed at this increment. In-flight backend stop/backpressure races and native acceptance remain separate gaps.

## Repair contract and acceptance gaps

Input must carry workspace, script, and current `runId`. The backend must reject a previous run's ID, even if a new process has the same workspace and script. Only the current running process can receive bytes. Stopping, exit, and disposal must remove or disable input without changing output handling.

Native keyboard entry, paste, focus, visual parity, real macOS input, and full-app asynchronous behavior remain NOT RUN. There is no screenshot because this increment has no admitted app or native execution. Passing mounted tests and Unix PTY tests will not, by themselves, establish native acceptance.
