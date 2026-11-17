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
- Passed hosted failing-before verification at `5905b3873b2be2153b7b1c6297bed51b603acdb6`: exactly five IME cases failed with one cancellation where zero was expected; the two ordinary-key controls passed. The full unit suite reported 2,938 passed and 5 failed. See [the hosted RED receipt](hosted-red.json) and [exact log excerpt](hosted-red.log.txt).
- Requalified all nine source pins against fresh main `9524569976a69a3151be1f2a3cac17bfac935312`. Every byte matched the original qualification; no frozen pin was rewritten. See [the comparison](requalification.json).
- Passed `python3 evidence/home-ime/verify-source.py --phase guarded` and `sha256sum -c evidence/home-ime/fixture.sha256` after adding one early return to `onSearchKey`. The regression and all four neighboring fixtures remain byte-identical. Optional access to `nativeEvent` also preserves existing direct KeyboardEvent fixtures; real React events supply that property.
- Passing-after hosted verification is pending on the guarded commit. Separate Reason pairing-code/sign-out timeouts are under their existing owner, not claimed fixed here.
- Local Node, setup, browser, native execution and installed-package behavior were not run. No screenshot exists because this change has not been run in a browser or native app.

The original Conductor input-method runtime, native/WebKit timing, composition-end ordering, side-by-side visuals and consuming-package behavior remain unverified. Static evidence is not native parity. Existing REA semantic heap-exhaustion limits are unchanged; this pass uses retained original bytes without a new engine call or acquisition.
