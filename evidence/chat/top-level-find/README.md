# Find in top-level chat messages

Conductor Rebuild. CHAT.SEARCH-BE7-01.

## Reference and checked source

The retained REA packet pins renderer `renderApp-D_fmY7hW.js` by SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its sixteen bounded extracts and original asset identities are in [the source receipt](reference/source-receipt.json). These are shipped-source evidence, not a new native observation. The historical whole-renderer REA semantic heap-limit gap remains open.

The fresh comparison is main `248b6c359c830c6ac5e050721bae18e44e168068`. `WorkspaceView` mounts `Transcript`, and the registry declares all four find commands, but those chat hosts have no find consumer. [The freeze receipt](freeze.json) pins the compared files and regression bytes.

The source contract is case-insensitive, nonoverlapping, literal text matching within one selected-session message. Text blocks join with one newline. Tool calls, tool results, thinking, and system messages do not count. A whitespace-only query has no matches; nonblank surrounding whitespace is significant. The query remains when the session changes, while selection resets. Close clears the query. Next and previous wrap, and Escape closes the find bar.

## Regression and boundaries

`tests/chat-search/transcriptFind.component.test.mjs` renders the actual production `Transcript` statements and loads the production search module when present. It isolates unrelated row leaves, preference/clock boundaries, and keybinding registration. It tests actual host registration, visible count, input changes, wraparound, Enter, Escape, zero results, close/reset, session changes, streaming updates, and inactive-host cleanup.

The original packet's test assertion body is retained verbatim. Only its setup selects the existing `rowTurn` variable declaration and opts into the new host's search-enabled prop. No frozen assertion was weakened. The untouched original file is retained in `reference/`.

Automatic hosted CI runs `node --test --test-reporter=tap tests/chat-search/transcriptFind.component.test.mjs`. This first publication contains tests only. Actual failing-baseline output is pending; no component result is claimed yet. No local Node process, install, browser, native app, CLI, provider, or E1 execution was started.

The component fixture does not establish DOM marks, geometry, real keyboard routing, focus, native parity, or provider behavior. Those need separate evidence. No screenshots exist because this delivery lane permits hosted frontend checks, not browser or native execution. The separate transcript-scroll packet and #1020 native acceptance remain unchanged. Frozen #847 is untouched.
