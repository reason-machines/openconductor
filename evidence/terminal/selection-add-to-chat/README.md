# Terminal selection to chat

Conductor Rebuild qualified the missing terminal-selection action against main `6b37c4dbb2aa9b6ff1186b988f16bbbb6eaab3ca` before changing production code. The three terminal/caller files are byte-identical to the earlier inquiry at `e4ab88de8cdb09dfa4c6b027558c7bedd2b2c019`.

## Original source

REA acquisition `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` retained the real Conductor renderer with SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Four exact handler ranges are recorded in `source.json` without copying the original implementation into the product.

- `rSa` subscribes to selection changes while ready and visible. It retains nonblank selection in React state.
- `iSa` renders `nSa` only for nonblank text and a session identifier. Clicking “Add to chat” stops propagation.
- `m$t` removes ANSI/control sequences and trims. No length truncation was observed.
- `rSa` constructs a timestamped text attachment for the workspace and addresses the attachment request to a session. Its success callback clears React selection state, not xterm selection, and calls `C9.focusAtEnd` for that workspace/session. This callback does not establish completed asynchronous upload.

## Current source and dependency boundary

The baseline terminal host and both direct callers have no selection action. Existing `terminalOf(id)` supports selection subscriptions without changing the terminal session layer. The composer accepts named text attachments, but the local chat bridge has no focus operation. Its editor handle only preserves caret position when focusing.

The coordinated implementation scope permits an optional end-position argument to the existing editor focus API, a local ChatPanel bridge forwarding it, and terminal host/direct-caller wiring. Ordinary focus, composer draft contents, submission, queue geometry, attachment transport and backend/provider code remain outside the change.

Calling `insert("")` is not a focus-only operation: `appendComposerText` trims trailing draft text and appends newlines. No custom event, DOM lookup or empty insertion substitutes for the explicit focus capability.

## Regression contract

Three new fixture files contain 20 cases:

- Eight mount the actual `TerminalHost` with real React/test-renderer. Terminal selection and excluded FindBar are explicit boundaries. Cases cover visibility, sanitation without truncation, accepted React-state reset, rejected-request retry, target changes, cleanup, exited output and empty normalized input.
- Five mount the actual `ComposerEditor` adapter with a real headless Tiptap document and ProseMirror selection. The DOM view is substituted to observe focus and apply real selection transactions. The actual ChatPanel bridge object is evaluated from current source. Cases cover ordinary focus, rich-content end focus, empty content, bridge forwarding and unmount.
- Seven evaluate the actual direct-caller JSX and selection callback from current source. Cases cover both terminal placements, target-session attachment acceptance, review-chat routing and stale workspace/session guards.

These tests do not prove native selection, actual browser focus/layout, clipboard behavior, asynchronous transfer completion or provider delivery. The caller tests do not mount the entire workspace.

The corrected test-only head `00bcc7a91d2b6516d46e69e8a823f6eff82c14d3` ran in automatic CI `43072746848`. Unit job `130704635122` recorded 17 assertion failures and three passing controls across these 20 cases; the ordinary suite recorded 2971 passes and 17 failures. Four callback-region existence failures establish missing source, not executed callback behavior. Typecheck job `130704634801` completed `tsc --noEmit` successfully, then failed the same ordinary-suite assertions. The retained log window (trailing whitespace removed only) and receipt are `baseline-00bcc7a.txt` and `baseline-00bcc7a.json`. Setup, loader and type errors are not behavioral RED.

Before the candidate, main `c25670504400771e2fb31e01560db249ea4bd06c` was fetched and re-read. It contains #1065. The three terminal/caller baseline files are unchanged; the editor matches #1065’s reported SHA-256, and its `atTop`/Up behavior is preserved. `candidate-source.json` records all four current-main and candidate source hashes.

The candidate subscribes to the visible host’s xterm selection, offers its normalized preview and action, sends a timestamped text attachment through the existing target-chat bridge, and clears only React action state when accepted. A guarded animation frame reveals/focuses that chat at the rich document’s end. Ordinary editor focus keeps its selection; no empty insertion or transport/backend change is used. All three fixture files are byte-identical to the corrected RED baseline.

Automatic hosted candidate `2165c8f2357178881f0664c931dfeecdcfa2a125` in run `43075592283` passed all 20 selection regressions (unit job `130714436588`, cases 1894–1913) and typecheck (`130714436742`). The ordinary suite passed 3007 of 3008 tests. Its only failure was the existing spawn-error component fixture: the fake xterm `Screen` did not implement `onSelectionChange`. The corrective change adds that disposable subscription API and empty `getSelection` result to the fake, without changing any existing test body, assertion, frozen selection fixture or production file. Build did not run because the unit failure stopped the job. The receipt is `candidate-2165c8f.json`. The corrected full suite and build await the next automatic hosted run.

No Node, browser, app or native execution ran locally. No screenshot is supplied because browser/native execution is outside this lane’s admission. Actual DOM layout/focus, installed-app behavior and asynchronous attachment/provider delivery remain unverified.

```bash
python3 evidence/terminal/selection-add-to-chat/verify-source.py
node --test src/features/terminal/selectionAddToChat.test.ts src/features/terminal/selectionChatFocus.test.ts src/features/terminal/selectionChatCaller.test.ts
```

The Node command is reserved for authorized hosted CI. Existing automatic frontend unit, build and package workflows provide delivery checks; no manual dispatch or rerun is needed. FONTREADY and native serialized acceptance remain separate.
