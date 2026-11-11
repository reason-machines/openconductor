# Clear-scrollback redraw request

Conductor Rebuild, terminal lane `1f14fa82-4ec3-41fc-b085-32ec441b4228`.

## Supported contract and scope

On immutable main `4739c9c029f87c64901a2431de6032b81f2b7348`, clearing a running, input-enabled terminal does not submit the formfeed (`0x0c`) request present in the retained Conductor controller. This is a frontend-to-PTY request-contract difference. No shell redraw, native command execution, visible parity, or native PTY reuse was observed.

The correction is limited to `session.ts`'s existing `clearTab` operation. Its local clear, backend history clear, mirror clear, and persistence flush remain intact. A programmatic redraw request must not mark `hasReceivedUserInput`, so it must not use the user-input bookkeeping helper added by #1010. Find, ordinary input, shortcut routing, initial commands, native commands, write queue, resource labels, scripts, and existing tests are outside this correction.

## Retained artifact identity

- Original REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
- Original attachment `bfa06ee0-799f-47fe-9edc-73997c70a340`, archive SHA-256 `d0d8e4b9b20c5150f30f5edff149bfc25f3074da5a1a66357b1caaf1ef0033ab`.
- Complete `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- Complete `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The [manifest](source/reference.json) records complete retained declarations/import/export bindings and six immutable comparison-source blob hashes. Every offset is a zero-based UTF-8 byte half-open range, not a JavaScript UTF-16 position. The retained JavaScript is inert untrusted data and is never evaluated.

## Identity-bound control, model, guard, and transport

1. Complete `lSa` renders `eSa` for an interactive surface. `eSa` passes the surface identity to `Xwa`, receives `runtimeSessionId:Q`, creates `()=>qc.clearScrollback(Q).fireAndForget()`, and supplies that callback to the visible `Zwa` branch.
2. Complete `Zwa` passes the same callback and terminal reference to `$wa`. Complete `$wa` installs a custom terminal key handler after the renderer is ready. A resolved `terminal.clearScrollback` in the normal buffer calls that callback. The unrelated fallback is not used because `eSa` supplied the callback. This finding does not reopen default shortcut precedence.
3. Renderer `qc` is the import of index `gh`, which exports `ts`; `ts=DAt()` returns a `$kt`. `$kt.createSession` registers `V9` instances by resolved session ID. `$kt.clearScrollback(id)` looks up that same instance, awaits its clear operation, then flushes its scheduled persistence.
4. Complete `V9.clearScrollback` clears screen state, transcript and replay; clears its ready renderer; calls `backendSession.write("\f")` only when `connectionState === "running" && isInputEnabled`; separately clears its backend mirror in engine mode; clears tracked commands; and emits change. It does not call `V9.write`, the method that marks user-input history.
5. `V9` initializes input disabled while launching, enables it after `whenReady`, and disables it after exit/cold restore. Its current snapshot supplies the guard at clear time. The full `V9` declaration is retained, not only the guard's text.
6. `DAt` defaults to `FAt`. Its local backend delegates to `_St.createSession`, which creates `ySt` and awaits spawn. `V9.spawnBackendSession` stores that result as `backendSession`. `ySt.write(data)` checks `isAlive`, then requests `pty_write` with its own PTY ID and the supplied data. The bounded claim ends at this source-level transport request, not native receipt or process execution.

## Fresh-main comparison and downstream boundary

The comparison baseline above contains merged #1010. Its input-state hunks are preserved. The prior candidate baseline `abd5b8df5fe2fb5ffff4dd4cbd210973cdb84a5c` and current baseline have identical `clearTab` implementations.

Current `term.attachCustomKeyEventHandler` resolves `terminal.clearScrollback` through `runTerminalCommand` to exported `clearTab(id)`. That operation calls xterm `clear()`, `ptyClearHistory(id)`, and `ptyWriteMirror(id, "\x1b[H\x1b[2J\x1b[3J")`, then flushes persistence. It never requests formfeed through `ptyWrite`.

The complete `pty.ts`, `writeQueue.ts`, native command adapter, and terminal manager baseline hashes are included. `ptyClearHistory` reaches `clear_history`, which clears buffered history. `ptyWriteMirror` reaches `write_mirror`, which updates a terminal/mirror screen instead of the process writer. Neither supplies a process-input formfeed. The existing native `NotRunning` rejection for ordinary writes remains unchanged and is not evidence of shell execution.

## Observable request contract

These cases specify the isolated callback boundary, not observed terminal behavior.

- Running and input enabled: clear the selected local screen/history/mirror, submit exactly one formfeed for the same ID, and leave user-input metadata unchanged.
- Running and input disabled: retain local/history/mirror clearing, but submit no process-input request and leave metadata unchanged.
- Starting, exited, or failed spawn: retain the same local/history/mirror clear behavior, but submit no formfeed and leave metadata unchanged.
- Sibling or closed terminal: clearing one terminal must not send the request to another live terminal.
- Existing clear shortcut: use the actual installed session key callback; do not introduce a new control or modify shortcut arbitration.

## Reproducible source integrity

```bash
python3 evidence/terminal/clear-redraw-1f/source/verify.py --originals .oc-tmp/vio-received-72733982/originals
```

Passed on Reason Cloud computer 300. Both complete assets rehashed, all 14 retained declaration/binding spans matched their exact original byte ranges, and all six immutable baseline blobs matched. This check reads source bytes only.

The new `$wa` and `lSa` declarations were bounded by unique named declaration anchors and their complete text inspected. This is not new AST validation. The earlier whole-module Babel 60-second timeout remains an analysis gap and was not repeated. No fresh REA/native extraction or acquisition was performed.

## Regression status

New `clearRedraw.test.ts` invokes production session, key-dispatch, tabs, and persistence logic with PTY, xterm/DOM, preference, and storage boundaries mocked. It covers all five guard states, the actual clear shortcut, both preexisting user-input metadata values, sibling isolation, and a closed terminal. The exact fixture is frozen in an unchanged-main snapshot before any product edit.

The serialized local unit ran on Reason Cloud computer 300 with existing dependencies, one foreground command at a time, nice level 19 and bounded Node heaps/timeouts. The frozen baseline produced the intended RED result: five passes and three assertion failures because the running clear and both shortcut cases emitted no formfeed. After the clear-only correction, the byte-identical regression passed all eight cases. Focused terminal and resource-label tests passed all 115 cases. No existing test was changed.

The first literal `npm run typecheck` invocation failed at Node's configured 768 MiB heap limit, exit 134, without a TypeScript verdict. This was not a machine-memory shortage. Execution stopped. The same executor admitted one corrected invocation with a 1,536 MiB heap. That invocation passed, exit 0, with no compiler diagnostics and no source or dependency change. No regression or focused test was rerun. The [verification receipt](verification.json) records exact commands, timings, outputs and limits; the [RED](before.tap), [GREEN](after.tap), [focused](focused.tap), [initial typecheck](typecheck.log), and [corrected typecheck](typecheck1536.log) logs retain the results with trailing whitespace and blank EOF lines removed. Raw log hashes are recorded in the receipt; assertions, counts, diagnostics, and fixture bytes are unchanged.

Fresh main `385ccb5229f56ff33903f034352eaa9827c40f0e` was checked before publication. Its only change after the frozen baseline is the disjoint Composer #1012 correction. The affected terminal source, focused resource-label test, and package manifests are identical. The local checks exercised the implementation on the frozen main baseline, not a separately rerun published head. Hosted exact-head workflows remain the merge gate. The unit's local processes were confirmed released at 07:40:01 UTC.

No build, app, provider, real shell, browser, native or visual check ran. The tests mock the PTY and renderer boundaries. They establish guarded frontend request behavior, not native delivery, actual shell redraw, installed-app acceptance or visual parity. The parked native failed-spawn/retry allocation and PTY identity/reuse evidence dependency is unchanged.
