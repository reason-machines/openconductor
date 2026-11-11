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

The initial commit contains tests and evidence only. Hosted baseline RED is pending. No Node, browser, app or native execution ran locally. The unchanged fixtures must run again after the minimal fix. Setup, loader and type errors are not behavioral RED.

```bash
python3 evidence/terminal/selection-add-to-chat/verify-source.py
node --test src/features/terminal/selectionAddToChat.test.ts src/features/terminal/selectionChatFocus.test.ts src/features/terminal/selectionChatCaller.test.ts
```

The Node command is reserved for authorized hosted CI. Existing automatic frontend unit, build and package workflows provide delivery checks; no manual dispatch or rerun is needed. FONTREADY and native serialized acceptance remain separate.
