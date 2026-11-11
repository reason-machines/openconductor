# Non-running terminal input admission

Conductor Rebuild source report and frontend correction for ACQ-TERMINAL-INPUT-STATE-1F-02. The original investigation was source-only. The implementation adds one input boundary and a regression that executes production session code with mocked PTY, DOM and xterm boundaries. No reference JavaScript, app, shell, browser, provider, install, or native probe was executed. This change does not reopen #1008 or its package tail.

## Verdict

The initial source investigation checked main `7ede41a2fdd582644b8a553308b5fb7ea83b8514`. Before implementation, main was resolved and fetched at `e8fad6caae23b20ddd81196c54c293e0001accd6`. The complete `session.ts` blob was unchanged. The regression reproduced the frontend mismatch on that fresh baseline before the product edit.

OpenConductor leaves a terminal's xterm input enabled while initially starting and after exit. Its ordinary input callback rejects only `spawn_error`, so starting/exited input can change `hasReceivedUserInput` and enqueue a PTY write. Conductor's retained controller permits those effects only while its connection is running and input is enabled. The exited-state difference does not depend on a spawn timing race.

This is a statically reachable frontend input/DOM/history-metadata difference, not observed installed-app behavior or proof that a stopped shell receives bytes. OpenConductor's own native writer explicitly rejects writes after exit. That downstream rejection prevents an exited-shell write claim, but occurs after the frontend bookkeeping and does not make the xterm textarea read-only.

## Artifact identity and scope

The original acquisition is REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The retained source came from attachment `bfa06ee0-799f-47fe-9edc-73997c70a340`, archive SHA-256 `d0d8e4b9b20c5150f30f5edff149bfc25f3074da5a1a66357b1caaf1ef0033ab`.

Both full original assets were rehashed in this pass.

- `index-BGEQ8YjU.js` has 3,493,297 bytes and SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `renderApp-D_fmY7hW.js` has 11,600,457 bytes and SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

[The manifest](reference.json) identifies 37 retained declaration/binding spans, 11 exact main-source blobs, and six reused local xterm files. Every reference offset is a zero-based UTF-8 byte half-open range `[start,end)`. These are not UTF-16 parser positions or character offsets. All copied reference code is untrusted data and must not be executed.

Previously AST-bounded declarations were matched against their full original bytes and checked-in span hashes. Additional small declarations were retained between unique named declaration anchors and their full text inspected. Their extraction method is explicit in the manifest; they are not presented as newly AST-validated declarations.

## Reference producer, caller, and consumer chain

1. **Runtime identity.** Renderer `qc` imports index `gh`. Index exports `ts as gh`; `ts=DAt()` returns the `$kt` runtime. `$kt.createSession` constructs the `V9` controller and registers it. These are the same complete declarations already retained for #1008, not a similarly named renderer-local variable.
2. **State producer.** `V9` starts with `connectionState:"launching"` and `isInputEnabled:false`. After backend readiness, it sets `connectionState:"running"` and `isInputEnabled:true`. Its backend exit callback sets `connectionState:"exited"` and `isInputEnabled:false`. `FSt` sets `spawn_error` and disables input. `PSt` disables input during retry. The full `V9` declaration is index bytes `[2756759,2771688)`.
3. **Actual admission boundary.** `V9.write` returns without marking input activity or calling its backend unless both `connectionState === "running"` and `isInputEnabled` hold. Only admitted nonempty input sets `hasReceivedUserInput`. `$kt.write(sessionId,data)` resolves the controller and calls that method.
4. **Ordinary xterm caller.** `Xwa` creates/reads the same `qc` session. It calls renderer-local `Loi({runtime:qc,sessionId:w,terminal:I,...})`. `Loi` calls `$kt.attachRenderer` with `tIr`. Complete `tIr.onInput` subscribes to the actual terminal's `onData` and invokes its callback unless the supplied input-disable predicate is true. `$kt.attachRenderer` reaches `V9.attachRenderer`; that calls `MSt`. `MSt` dispatches either to `V9.write` directly or to `TSt` and the `wkt` ordered-input buffer, whose eventual callback also calls `V9.write`. Neither scheduling branch bypasses the final running/enabled guard.
5. **Snapshot-to-visible-stdin identity.** Renderer `U4e` imports index `gn`, which exports `LAt`; `LAt` returns `ts.getSession(bI(terminalId))`. Renderer `aVe` imports index `g$`, which exports that same `bI` runtime-id selector. `G5e` reads `U4e` and refreshes on the matching session/handoff changes. `eSa` reads `G5e({terminalId:surfaceId})`, derives `d=snapshot?.isInputEnabled ?? true`, and passes `disableStdin = isArchiving || !d` into `w9e`.
6. **Visible xterm consumer.** `w9e` passes this value through `dno → uno → cno → lno` when creating/attaching its terminal. `lno` supplies it to `new eno({disableStdin:...})`. On subsequent changes `w9e` calls its renderer-local `$At`, which sets `terminal.options.disableStdin`. This `$At` is not index's differently scoped destroy-session function.
7. **Line-edit caller.** `eSa → Zwa → $wa` supplies `writeInput`. That callback calls `qc.write` with the selected runtime id, so keyboard line-edit bytes also encounter `V9.write`'s admission boundary. No shortcut-label or line-edit-byte change is proposed.

Important retained ranges include `MSt [2559162,2559422)`, `TSt [2558263,2558398)`, renderer `tIr [152421,153322)`, `Loi [153322,153620)`, `G5e [6948263,6948594)`, `w9e [6919236,6922665)`, renderer-local `$At [6916898,6918617)`, and `eSa [11160762,11165279)`. The manifest records the complete remaining ranges and hashes.

The unregistered-session interval is not claimed to have disabled stdin in Conductor. `eSa` defaults the missing snapshot's input flag to true, but the runtime binding is established through `Xwa`; the controller and direct `qc.write` paths still enforce their own admission. The supported finding concerns registered starting/running/exited/error lifecycles, not an assertion that every pre-registration frame is read-only.

## Main source counterexample and downstream check

The following paths were read from immutable main `7ede41a2fdd582644b8a553308b5fb7ea83b8514`, not inferred from an older PR.

- `session.ts:startTab` constructs `new Terminal` without a `disableStdin` option and installs its ordinary `onData` callback. It registers the tab before awaiting `spawnTerminal`. The callback rejects only `spawn_error`; otherwise nonempty input sets `hasReceivedUserInput` and calls `ptyWrite`.
- `session.ts:route` sets `disableStdin=false` on ready. Its exit branch writes the process-exit message and dispatches exited status, but never disables stdin. `spawnTerminal` sets `disableStdin=true` on failure. Retry retains that disabled option until another ready event. No change to these failure/retention semantics is proposed.
- `TerminalPanel.tsx:TerminalHost` attaches the same xterm independently of status. `PanelStrip.tsx` subscribes to tab state and passes the selected tab's status into that host. `WorkspaceView.tsx` does the same for a center terminal. An exited tab remains mounted and can retain keyboard focus. No status-dependent teardown or read-only control closes the input path.
- Main pins `@xterm/xterm` version `6.0.0`; the reused local package also reports `6.0.0`. Its installed `OptionsService.DEFAULT_OPTIONS` sets `disableStdin:false`. `CoreBrowserTerminal` maps the option to `textarea.readOnly` and normal key/input events call `CoreService.triggerDataEvent`. `CoreService` drops those events only if `disableStdin` is true, otherwise emitting `onData`. `CoreTerminal` forwards that event to the public terminal. The installed compiled library contains the same default and admission condition. These dependency source reads are not a browser run or an independent package-integrity proof.
- Consequently an ordinary key in a focused exited terminal can reach the unchanged frontend callback. It marks the session as having input and enqueues a write despite exited status. The stored metadata is passed through `PersistThrottle` to `ptyPersistTerminalHistory`; pagehide or later persistence can therefore persist that changed flag. Actual persistence after a specific real keystroke was not run or observed.
- `runTerminalCommand` directly calls `ptyWrite` for `LINE_EDIT_BYTES` without checking lifecycle status. This is a second call site within the same input-admission hunk, not a separate shortcut-feature investigation.
- `pty.ts:ptyWrite → createPtyWriter` serializes writes but contains no lifecycle guard. Its send callback invokes `pty_write`.
- OpenConductor's own `terminal_commands.rs:pty_write → PtyManager.write` looks up the session and returns `NotRunning` when `exit_info` exists. Before native registration a lookup can also fail. A native rejection is swallowed by the frontend's existing catch after its input-history mutation. This disproves an assumption that forwarding alone proves shell execution. No Conductor native allocation or PTY-reuse body was acquired or inspected.

## Implementation scope

The correction uses the same bounded paths submitted to the ledger. There is no known competing owner on these input hunks. Boundary Discipline and Laziness Protocol shaped the implementation: reuse the existing tab lifecycle and xterm stdin option, and share one admission function between ordinary and line-edit input rather than add another state store.

- `src/features/terminal/session.ts`. Ordinary input and `LINE_EDIT_BYTES` now share `writeInput`. It requires an existing running tab with stdin enabled before changing user-input metadata or submitting a PTY write. New terminals start with stdin disabled; ready enables it and exit disables it. Find, local clear-screen work, tab commands, initial bootstrap commands, resource labels, failure retention, and the startup overlay are unchanged.
- New `src/features/terminal/nonrunningInput.test.ts`. Thirteen cases cover ordinary and line-edit input in starting/running/exited/spawn_error states, explicitly disabled running stdin, stdin lifecycle transitions, retry, persisted user-input metadata, Find and clear. The fixture runs the actual session, tab store, shortcuts and persistence throttle. External PTY, DOM/xterm, storage and preference/font boundaries are isolated. Existing dependencies are reused. Frozen tests, including `spawnFailure.test.ts`, are unchanged.
- `evidence/terminal/nonrunning-input-1f/`. The retained source report, exact-byte verifier, and actual RED/GREEN receipts.

No production edit is made in `tabs.ts`, `TerminalPanel.tsx`, shared workspace/panel consumers, the PTY writer/native manager, scripts, browser, Resource64, CSS, or existing tests. No missing source identity is needed for the bounded frontend correction. Real keypress/DOM/persistence and installed/native acceptance remain unverified and require separate execution admission.

## Checks and limitations

- **Passed source-integrity checks.** Two complete retained assets matched their known SHA-256 hashes. All 37 retained slices matched their recorded byte ranges. Eleven main file blobs and six local dependency files are identified by hash in the manifest.
- **Passed source freshness check.** `repos_compare_commits` resolved checked commit and main as identical. `git diff --quiet 7ede41a -- src/features/terminal` confirmed no local terminal product changes.
- **Failed analysis operation.** A low-priority whole-module Babel parse timed out after 60 seconds with no spans. It was not rerun. The narrower retained-byte extraction completed without evaluating reference or product code. Earlier REA semantic-renderer heap exhaustion and the lack of a REA MCP operation remain historical acquisition limitations.
- **Passed regression proof on Cloud computer 300, 11 November 2026 UTC.** `node --experimental-strip-types --test src/features/terminal/nonrunningInput.test.ts` first produced 3 passes and 10 intended assertion failures at 07:01:02–07:01:08 on baseline `e8fad6caa`. The exact same file passed 13/13 at 07:01:41–07:01:44 after the correction. Its SHA-256 before and after is `905655877316bca8c68b81865517131b525a13e73bb9ee0031a2b0faf85f0c54`. See [RED](before.tap) and [GREEN](after.tap).
- **Passed nearby checks.** `node --experimental-strip-types --test --test-concurrency=1 src/features/terminal/*.test.ts src/components/resourceUsageLabels.test.ts` passed 107/107 at 07:01:56–07:02:17. `npm run typecheck` passed at 07:02:38–07:03:43. See [focused log](focused.tap) and [typecheck log](typecheck.log). Existing `node_modules` was reused; no dependencies were installed. These are isolated frontend checks, not a browser or native session.
- **Not run.** Local build/full frontend suite, install, shell/provider, browser/native runtime, E2E, screenshot, and real keypress/persistence observation. No screenshot exists because this lane has no UI/native runtime admission. No process or runtime lease is retained. Hosted exact-head checks remain a separate delivery gate.
- **Parked unchanged.** Same-build native failed-spawn/retry allocation, lookup, cleanup, and PTY identity/reuse evidence remain missing. This frontend correction makes no claim about that invariant.

Temporary source snapshots and data-analysis files remain untracked under `.oc-tmp`; they are not part of the product diff. No new acquisition, check dispatch, observer, or duplicate #1008 follow-up was created. [Machine-readable receipts](verification.json) identify the tested baseline and limitations.
