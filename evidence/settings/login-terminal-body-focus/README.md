# Login terminal body-click focus

Conductor Rebuild owns this narrow sign-in/settings slice. The baseline is test-only. Do not interpret a harness failure or a passing baseline as proof of a product defect.

## Source contract

Current main was re-read at `26f8345401efb021bef2f12b17815eba6c57170c`.

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

Hosted behavioral baseline: **not run yet**. No production code is changed in this baseline.

## Limits

No local/cloud product behavioral runtime, native app, real login/provider, credentials, protected app/PID, or user files were touched. No screenshot is available because no visible app was run. jsdom proves DOM event/focus/input routing for the exercised inputs, not physical hit-testing, macOS focus, installed-app behavior, or native acceptance. The settled-exit resize guard, output acknowledgement, terminal fitting, auth refresh rules, and provider architecture remain outside this change.
