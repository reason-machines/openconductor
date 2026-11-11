# Find in top-level chat messages

Conductor Rebuild. CHAT.SEARCH-BE7-01.

## Reference and checked source

The retained REA packet pins renderer `renderApp-D_fmY7hW.js` by SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its sixteen bounded extracts and original asset identities are in [the source receipt](reference/source-receipt.json). These are shipped-source evidence, not a new native observation. The historical whole-renderer REA semantic heap-limit gap remains open.

The fresh comparison is main `248b6c359c830c6ac5e050721bae18e44e168068`. `WorkspaceView` mounts `Transcript`, and the registry declares all four find commands, but those chat hosts have no find consumer. [The freeze receipt](freeze.json) pins the compared files and regression bytes.

The source contract is case-insensitive, nonoverlapping, literal text matching within one selected-session message. Text blocks join with one newline. Tool calls, tool results, thinking, and system messages do not count. A whitespace-only query has no matches; nonblank surrounding whitespace is significant. The query remains when the session changes, while selection resets. Close clears the query. Next and previous wrap, and Escape closes the find bar.

## Regression and boundaries

`tests/chat-search/transcriptFind.component.test.mjs` renders the actual production `Transcript` statements and loads the production search module when present. It isolates unrelated row leaves, preference/clock boundaries, and keybinding registration. It tests actual host registration, visible count, input changes, wraparound, Enter, Escape, zero results, close/reset, session changes, streaming updates, and inactive-host cleanup.

The original packet's test assertion body is retained verbatim. Only its setup selects the existing `rowTurn` variable declaration and opts into the new host's search-enabled prop. No frozen assertion was weakened. The untouched original file is retained in `reference/`.

Automatic hosted CI runs `node --test --test-reporter=tap tests/chat-search/transcriptFind.component.test.mjs`. [The actual baseline receipt](baseline-red.json) records PR head `6e0d166e9d2aae54fbc6fbb2cde75db1177897e4`, checked out as merge `50cacfe8043896c362ede066e7d1a634aa21bb26`, in [job 130624942782](https://github.com/reason-machines/openconductor/actions/runs/43050219903/job/130624942782). Dependency setup passed. All five component tests failed at the intended missing `chat.search` registration, not at setup. The implementation was written after that result; candidate hosted results are pending. No local Node process, install, browser, native app, CLI, provider, or E1 execution was started.

[The loader-only correction](loader-setup-correction.json) records support for dotted TypeScript basenames after the first candidate reached the new icon dependency. All test assertion bodies were preserved.

The independent `transcriptFind.dom.test.mjs` fixture uses actual `Transcript`, row functions, and `KeybindingsProvider` in jsdom. Markdown, user-text, tool, and unrelated menu leaves are isolated; checks cover plain-text marks, focus, scroll requests, cleanup after streaming, terminal exclusion, overrides, and focused scopes. Its bytes were frozen before the implementation. The pure matcher has additional session, report-exclusion, cross-message, empty-chat, and turn-order controls. These additional tests have not run on the baseline and their candidate results are pending.

## Implementation shape

`WorkspaceView` supplies `searchEnabled` only for visible chat content. It retains the empty `Transcript` host alongside `ChatEmptyState`, so a loaded empty chat still binds find. The search module emits a find bar and the existing transcript element as siblings without changing the immediate scroll-container layout. Existing isolated transcript fixtures opt out by default. The global search state preserves the query across session switches; the active session resets selection. Highlight refresh never scrolls; only explicit next, previous, and scroll-to-current commands center a turn. [The source-qualified scroll correction](explicit-scroll-contract.json) adds an explicit current-match action before the existing DOM scroll assertions and a separate passive-streaming control without changing any existing assertion. Raw source-text matches and rendered text-node marks intentionally have distinct boundaries, as in the retained source. Cross-node Markdown, mention, and display-filter transformations can make the raw count differ from marks; these fixtures do not establish parity there.

No screenshots exist because this delivery lane permits hosted frontend checks, not browser or native execution. jsdom scroll calls do not prove geometry, and synthetic keyboard dispatch does not prove OS or WebKit routing. Native and provider behavior remain unverified. The separate transcript-scroll packet and #1020 native acceptance remain unchanged. Frozen #847 is untouched.
