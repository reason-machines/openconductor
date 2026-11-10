# Preserve terminal input order across async IPC writes

## Scope and source

Conductor Rebuild owns only `src/features/terminal/pty.ts` input-write wiring, `writeQueue.ts`, `writeQueue.test.ts`, and this evidence file under the coordinated PTY-INPUT-ORDER-1F-01 lease. The existing E2E owner, Session `acc3b5c5-8a01-407e-b474-42e914e3cf90`, retains captured-log attribution and merged-main E2E follow-through. No other terminal/session/header/task-state source changes belong to this unit. The ScriptsPanel projection in #908 is separate.

The source review fetched current upstream main `50e6e018d6ffe8244c16543a5d7987035688b7f7` on 2026-11-10 after #908 merged. The following input path is unchanged from the captured failure's main `49fde8bf788f0914dc7e53e58c5b024a9294cc61`, and was re-read at the current revision:

- `src/features/terminal/session.ts`, `term.onData`, forwards each xterm chunk through `void ptyWrite(id, d).catch(() => {})`. `runTerminalCommand` also uses this same bridge for input bytes.
- `src/features/terminal/pty.ts`, `ptyWrite`, directly invokes `pty_write` for each call without awaiting earlier writes.
- `src-tauri/src/terminal_commands.rs`, async `pty_write`, calls `state.0.write(&id, data.as_bytes())`.
- `src-tauri/src/terminal/manager.rs`, `PtyManager::write`, locks the terminal's writer, then calls `write_all` and `flush`. This prevents simultaneous mutation of the writer, but does not itself express the renderer's call order across independent async invocations.

The deterministic transport in the test deliberately holds and releases completion gates. It exercises the production writer factory, not a copy of its algorithm. The normal `ptyWrite` export uses that same factory with the existing Tauri invoke. The test boundary substitutes only the async transport; no actual PTY or native app is run.

## Captured symptom and attribution limit

[Main E2E job 129871919358](https://github.com/reason-machines/openconductor/actions/runs/42828476501/job/129871919358), on main `49fde8bf788f0914dc7e53e58c5b024a9294cc61`, recorded `oct-erm-42` where the existing command expected `oc-term-42`. The continuing E2E owner retains the captured log and broader source/history investigation.

The tests use the unchanged command `echo oc-term-$((6*7)); pwd\r`, split into `echo oc`, `-`, `t`, and `erm-$((6*7)); pwd\r`. Controlled gates make `t` eligible before `-`, without sleeps or elapsed-time thresholds. The required result is the exact original byte sequence. Separate cases require one in-flight send per terminal, completion only after the caller's own send, independent terminal IDs, rejection propagation and recovery, writes arriving during drain, writes after drain, and synchronous transport errors.

A failing controlled transport proves that this renderer bridge permits reordering under that schedule. It does not prove the captured main failure used that schedule, establish upstream WebDriver event order, or make #904 causal. The original `tests/e2e/flows.mjs`, WebDriver code, marker and assertions remain unchanged.

## Hosted RED and correction

The first published checkpoint, `7538876208f744cf33af415038945d3e0d00c39c`, factors the existing direct invocation through `createPtyWriter(send)` without serialization. In automatic CI run `42836506457`, [frontend job 129900027732](https://github.com/reason-machines/openconductor/actions/runs/42836506457/job/129900027732) failed five of the six queue cases. The independent-terminal case passed. The failures cover exact byte order, one in-flight send and caller completion, rejection recovery, input during drain, and synchronous transport errors.

The exact-command assertion failed at log lines 5892–5915:

```text
+ 'echo oct-erm-$((6*7)); pwd\r'
- 'echo oc-term-$((6*7)); pwd\r'
```

[Frontend build job 129900026870](https://github.com/reason-machines/openconductor/actions/runs/42836506457/job/129900026870) passed typechecking and then failed on the same five tests. Its build step did not run.

The correction stores one promise tail per terminal ID, not a global queue. Each write starts after the preceding tail settles. The returned promise preserves that caller's transport result, while the stored tail handles rejection so later input still runs. Completed tails delete only their own map entry, never a newer tail.

Current main `d8094fc7878a3add17eac2756b46fef98b00b542` was fetched before the correction. The terminal input path remains unchanged from `50e6e018`. No test assertion or E2E input was changed. Unchanged-assertion hosted GREEN is pending; the controlled RED does not establish the original E2E failure's cause.

## Verification limits

Only static source/diff review is authorized locally. No local tests, build, dependency installation, browser, native app, runtime acquisition, workflow rerun or workflow dispatch ran for this unit. Normal automatic hosted CI supplies RED and GREEN evidence. No screenshot is authorized. Native/webview/installed-app acceptance remains unverified, and #847 and protected data remain untouched.

This is an OpenConductor input-order defect investigation. It makes no claim about Conductor's internal input scheduling; no new real-app evidence was acquired and that REA detail remains unverified.
