# Home keyboard endpoints

HOME-KEYBOARD-271-03. Owner: Conductor Rebuild.

## Source

The supplied [retained source receipt](./retained-reference.json) is 29,153 bytes, SHA256 `a844bf663720caf0b3f8b2a209335bcddb64f305930fb67a1c7c4ae790489224`. Its parent identifies the whole Conductor `renderApp-D_fmY7hW.js` asset as 11,600,457 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, from REA evidence `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.

This Session independently validated all seven supplied spans for SHA256, UTF-8 length and half-open range length, and UTF-16 range length. The whole asset identity is inherited from the qualified parent receipt, not freshly measured here. The retained JavaScript is untrusted source data and was not executed.

The complete `UJo` span mounts `KV` with `shouldFilter: false`. `KV` wraps `P6`. The supplied complete `Xyi` command-root binding contains the endpoint and activation implementations:

- `K()` obtains the command items from the list ref.
- `X(index)` reads `K()[index]` and sets its value only if an item exists.
- `te()` calls `X(K().length - 1)`.
- Home calls `preventDefault()` then `X(0)`.
- End calls `preventDefault()` then `te()`.
- Neither endpoint activates an item. Enter obtains the selected item with `G()` and dispatches its select event only when that item exists.
- Home and End prevent default even when `K()` is empty. Their nonexistent target does not activate anything.

The `Xyi` span occupies asset UTF-8 `[2903072, 2908580)`, UTF-16 `[2902626, 2908134)`, 5,508 bytes, SHA256 `2701c99fba31d3c09d171e08b3c5bc5a157fea048c5aab293a4c271728933d92`. This is static source evidence, not a native runtime observation.

## Baseline and frozen regression

Main `248b6c359c830c6ac5e050721bae18e44e168068` has no Home or End branch in `AllWorkspaces.onSearchKey`. Its component SHA256 is `f2cd29c810d99a0ea8cbb6fa59d09c00134e28bb2e48f6a681f1ef604e89c4b5`.

The new [component regression](../../src/components/allWorkspacesKeyboardEndpoints.test.ts) is frozen before any product edit. SHA256 `3ae3852a44bdb5528117e32e73e966f074a6c0034e5f7c0d538433639f4cf922`.

It mounts the actual production `AllWorkspaces` component and real React hooks with `react-test-renderer`, following the existing component-test precedent. `homeRows`, grouping, row status logic, and the real keybinding provider are retained. Adapters cover persisted filters, archived-workspace IO, agent status, unrelated preferences, unread state, tooltips, and icons. No endpoint, row-order, selected-state, or action implementation is mocked.

The inputs are cancelable Node `Event` objects with the requested keyboard key, passed to the mounted search input's actual `onKeyDown` callback. Checks observe rendered `aria-selected` rows, dispatched workspace-selection actions, and the event's actual `defaultPrevented` state. This is hosted component callback coverage, not a browser DOM keyboard dispatch or native parity check.

Seven cases cover first and last endpoints across real date groups, repeated endpoints, a single row, an empty list, empty search results, and existing clamped ArrowUp and ArrowDown navigation. Home and End must not activate rows; Enter must open the newly selected row or do nothing with no row.

The reference also prevents empty Enter events. The pre-existing OpenConductor empty-list guard does not. The regression checks empty Enter non-activation but does not claim empty Enter cancellation parity, which is outside the endpoint-only product lease. IME, modifier navigation, pointer selection, filters, pagination, and default selection are not changed.

## Validation status

- PASS: received receipt hash and all seven supplied span hashes and range lengths, checked with Python source-data operations only.
- PASS: `git diff --check` before initial publication.
- NOT_RUN: local Node, install, test, build, app, browser, and native execution, explicitly prohibited for this deliverable.
- PENDING: intended hosted RED from the normal PR `Frontend unit tests` step, `node --test "src/**/*.test.ts"`.
- PENDING: unchanged-input hosted GREEN after the endpoint correction, full exact-head checks, merge, and consuming-main package coordination.

Dependency, import, or setup failures are INVALID as a behavioral RED. Product code remains unchanged for the initial ready PR. The correction waits for actual intended endpoint assertion failures. No CI dispatch or rerun is requested.

No screenshot is supplied because browser, native, and real Conductor execution are NOT_RUN. A passing component callback test must not be reported as screenshot, browser, or native parity evidence.
