# Login input after a settled matching PTY exit

Conductor Rebuild re-read clean main `87e6da16d981de85ee26c16fac14c00a45c62025` after #1084 merged and its exact consuming-main macOS package passed static qualification. The retained predecessor receipt records all 39 passing bundle checks and the downloaded artifact's matching GitHub digest. Native/provider acceptance is separate and remains unverified.

## Source contract and bounded finding

The shipped Conductor REA chain is `ONi -> nZe -> Loi -> tIr -> runtime.attachRenderer -> controller.attachRenderer -> MSt`. Ordinary input is gated by `TSt`; optimistic/immediate and ordered input ultimately call the controller's `write`. After its matching exit settles, the controller records `connectionState="exited"` and disables input. `write` dispatches only while running and input-enabled. Both the complete embedded-terminal and attachment functions, the runtime aliases and all input/exit joins are retained as original bytes.

OpenConductor already filters events by its reserved terminal ID and records `exited = true` for a matching exit. Its `onData` checks only the resolved ID, so subsequent input still reaches `ptyWrite`. The backend stores exit information before emitting the exit and already rejects later writes with `NotRunning`. This finding concerns unnecessary frontend bridge dispatch only: no dead-process write, visible error, crash or provider impact has been observed.

The proposed correction reuses the existing `exited` liveness flag in `onData`. It must not gate on the `completed` presentation state: command completion deliberately keeps the shell usable. No ACK callback, backend, general terminal, script input or provider architecture changes are in scope.

## Frozen real-component regression

`src/settings/agents/loginTerminalInputAfterExit.test.ts` mounts the actual `LoginButton`/`LoginTerminal` through the unchanged completion fixture's factory, real React and controlled xterm/PTY boundaries. Only an ACK stub is supplied in the isolated loader. The existing completion factory, seven-case ACK fixture and paired ACK proof stay byte-identical.

The six frozen cases are:

- No dispatch after the shell's own settled exit.
- No dispatch after command completion followed by that shell's later settled exit.
- Running-shell input still reaches the matching PTY.
- Completed but live shells remain writable.
- A foreign terminal's exit does not disable input.
- Dismissal ignores a stale matching exit without a status refresh.

The two post-exit assertions are predicted failures on unchanged product code; the other four are controls. Actual hosted behavioral RED has not run at this checkpoint. Product source is unchanged, and no repair will be published before the intended baseline assertion failures are observed. The frozen fixture SHA-256 is `64d426e2f94d8fc9541b43b8c45dffe9b47b7e71661e7b728bf9fe434cc35318`.

The oracle is deliberately limited to a settled spawn and a settled matching exit with no queued output. Input during spawn, input while post-exit output still renders and exit before create resolves are excluded. Early-input readiness was separately closed as a bounded nondefect; this change does not reopen it.

## Verification and provenance

`python3 evidence/settings/login-terminal-input-after-exit/verify_source.py <original-upload.tar>` checks the original archive and both asset hashes, all 21 exact source spans (including two complete functions), seven pinned current-main source files, baseline source, frozen component tests and the exact permitted one-guard candidate shape. This is source verification, not behavioral RED/GREEN.

`reference-source.json` retains exact byte ranges, hashes and REA evidence lineage. Earlier semantic renderer analysis exhausted the heap; these shipped bytes were inspected statically, without evaluating reference JavaScript. The normal automatic hosted `node --test "src/**/*.test.ts"` workflow is the admitted behavioral executor. No workflow change, manual dispatch, rerun, duplicate watcher or local Node execution is introduced.

No native UI, real PTY/IPC, provider or credential execution is admitted here. No screenshot is available because this source/component lane does not run a browser or the native app. Side-by-side rendering and provider acceptance remain unverified.
