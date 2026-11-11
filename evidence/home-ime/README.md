# Home search input-method key handling

Conductor Rebuild qualified `ACQ-HOME-IME-271-06` against main `1b415a2c9eacd606e5697cb30bee4d7c3b559b0f`.

## Source finding

The retained Conductor 0.87.6 renderer has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its REA parent is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Seven complete retained spans bind Home `UJo`, its `KV`/`kI` wrappers, native command input `B5s`, command root `Xyi`, component aliases and selected-row callback. Exact byte offsets and hashes are in [the source receipt](source.json).

Before entering its navigation/Enter switch, `Xyi` ignores an already-prevented event, `nativeEvent.isComposing`, or legacy `keyCode === 229`. The current Home search handler had no corresponding guard. With the search input focused and workspace B selected, composing Enter therefore cancels the input-method confirmation and opens B in the clone, while the reference local handler does neither. Composing navigation similarly moves the clone's selected workspace.

The current upstream chain was read through App, KeybindingsProvider, listeners, dispatcher, binding, registry and select-all interception. Under default shortcuts, no recording, no dialog/terminal, no recent Option suppression and plain unmodified keys, that chain does not suppress the Home event. The mounted regression routes events through the real global listener/dispatcher and default App-shell command registrations before calling the actual Home input handler. It does not mount the full App or native input method.

## Frozen regression

`src/components/homeIme.test.ts` contains seven mounted cases. Five negative cases cover composing Enter, legacy-229 Enter, composing navigation, already-prevented events and an empty-list composition control. Two positive cases retain ordinary Enter targeting and ordinary arrow/Home/End navigation. The fixture hash is frozen in `fixture.sha256` before the product change.

Existing endpoint7, emptyEnter4, sidebarHint6 and header8 fixture bodies are pinned and untouched. No shared global keyboard behavior changes.

## Verification

- Passed source qualification using static Python, with seven retained spans, sixteen contract checks and nine current source pins.
- Passed `python3 evidence/home-ime/verify-source.py --phase baseline` before any product fix.
- Passed `git diff --check`.
- Hosted regression-first execution is pending on the test-only commit. The product guard must not be added until the intended cancellation/selection failures are observed and the positive controls pass.
- Local Node, setup, browser, native execution and installed-package behavior were not run. There is no screenshot because this increment is source qualification plus an unexecuted mounted fixture, not a visible app run.

The original Conductor input-method runtime, native/WebKit timing, composition-end ordering, side-by-side visuals and consuming-package behavior remain unverified. Static evidence is not native parity. Existing REA semantic heap-exhaustion limits are unchanged; this pass uses retained original bytes without a new engine call or acquisition.
