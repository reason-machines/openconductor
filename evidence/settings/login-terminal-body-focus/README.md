# Login terminal body-click focus

Conductor Rebuild owns this narrow sign-in/settings slice. The hosted test-only baseline reproduced both intended focus failures and passed all three controls. The candidate adds only a body-click handler that focuses its contained textarea; candidate hosted results are pending.

## Source contract

The frozen baseline was read at `26f8345401efb021bef2f12b17815eba6c57170c`. Current default main was re-read at `873e24f94a3b07a1ebcd351ac3b095f2cff561d0`; all six source pins remain byte-identical. The terminal owner confirmed no overlap with its ordinary-session Unicode work.

The retained Conductor renderer joins `jpa → Met → ONi → w9e.focusTerminal`. `ONi` forwards clicks on its padded terminal body to `focusTerminal`, which finds its contained textarea and focuses it. Original archive and renderer hashes, exact UTF-8/UTF-16 spans, and the original REA evidence ID are in [the source manifest](source.json). These are static shipped bytes, not native observations. Historical semantic renderer analysis exhausted heap; no new REA failure occurred.

OpenConductor's real Claude and Codex settings callers reach `LoginButton` through `kit.tsx`. `LoginTerminal` opens xterm in a body with 12px padding but has no body click handler. The package-lock-pinned xterm 6.0.0 source creates a child `.xterm` element and binds its always-on mousedown focus handler to that child, not to the padded parent. Its document mouseup/move listeners are registered only after that child mousedown. The npm tarball's SHA-512 matches the lockfile; bounded source spans are retained here.

This difference becomes a qualified mounted defect only if the hosted baseline loses wrapper focus while the real-xterm-child control passes.

## Frozen hosted regression

[The new DOM test](../../../tests/chat-search/loginTerminalFocus.dom.test.mjs) mounts production `LoginButton` and the actual locked xterm and FitAddon implementations in jsdom 26. It loads the production terminal-body CSS, moves focus outside the terminal, and dispatches bubbling mousedown, mouseup, and click events directly on the padded wrapper. The assertions inspect `document.activeElement` and type through the focused DOM element into the same inert PTY.

The canvas substitute supplies only painting/text metrics. It does not replace DOM focus, event propagation, xterm input handling, or the production click handler. PTY transport is inert and rejects unmapped imports; no real provider or native PTY is involved.

Expected baseline: the running and completed-but-live wrapper focus assertions fail. Real xterm child click/focus/input, Close-without-refresh, and Done-with-refresh controls pass. The same fixture bytes must be used after the minimal production correction.

The existing automatic frontend-unit workflow already installs jsdom and runs `tests/chat-search/*.dom.test.mjs`. No workflow, dependency, or shared harness changes are needed.

```bash
ONBOARDING_DOM_DEPS=<existing-CI-prefix> node --test --test-reporter=tap tests/chat-search/loginTerminalFocus.dom.test.mjs
```

## Preparation checks

Passed before publication:

- `node --check tests/chat-search/loginTerminalFocus.dom.test.mjs` parses the test without evaluating it.
- `python3 evidence/settings/login-terminal-body-focus/verify_source.py <original-archive> <locked-xterm-tarball>` verifies original source identities, source joins, fresh-main pins, the frozen fixture, and an altered-identity negative control. It executes no reference or product JavaScript.
- `git diff --check`.

## Hosted baseline and minimal correction

Automatic [CI run 43154707640](https://github.com/reason-machines/openconductor/actions/runs/43154707640/job/130971825134) on published test-only head `9775be71cbd5d441b9ea5a0be24f0790832f4281` reproduced exactly the two intended focus assertions. Both running and completed-but-live wrapper clicks left `document.activeElement` at the outside button instead of their textarea. The real-xterm child click/input, Close, and Done controls all passed. The entire DOM step reported 98 passed, two failed, zero skipped/cancelled. Typecheck/build passed. [Retained raw excerpt](hosted-baseline.log) and [machine-readable receipt](hosted-red.json) identify the observation.

Only the production body receives `onClick={() => mount.current?.querySelector("textarea")?.focus()}`. This follows the retained shipped callback and reuses the existing mounted-body ref. No new state, terminal ref, transport, auth callback, or lifetime is introduced. The five-case fixture remains byte-identical at SHA-256 `ccf31e78a273547d153bbcfdd98ba76a5413b4da030df3fcfa7037aac0a16253`.

Candidate hosted GREEN and exact-head aggregate checks remain pending. No local behavioral runtime was started.

## Limits

No local/cloud product behavioral runtime, native app, real login/provider, credentials, protected app/PID, or user files were touched. No screenshot is available because no visible app was run. jsdom proves DOM event/focus/input routing for the exercised inputs, not physical hit-testing, macOS focus, installed-app behavior, or native acceptance. The settled-exit resize guard, output acknowledgement, terminal fitting, auth refresh rules, and provider architecture remain outside this change.
