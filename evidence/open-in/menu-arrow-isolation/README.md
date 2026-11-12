# Split Open in arrow-event isolation

Conductor Rebuild identified this source-level gap against main `1d9c4027909205d1dba9006031d922a5f2f2287a`. The current split menu moves focus even when an arrow event is already prevented. When it does move focus, it prevents the browser default but does not stop bubbling.

## Reference authority

[source.json](source.json) binds the retained REA extraction of Conductor 0.87.6 to the renderer asset hash, exact UTF-8 byte ranges, original P9 block, wrapper alias, baseline product source and new fixture. The original split/default P9 passes `xd(_vs)` as its menu handler. The retained wrapper is an identity alias. `_vs` ignores already-prevented arrows and calls both `preventDefault()` and `stopPropagation()` when it moves focus.

Icon and compact P9 variants return earlier through another menu primitive. They are not separately established by this evidence. The reference selector also supports slider and switch rows, which the current split menu does not contain. This repair does not add them.

## Frozen regression

The new `src/features/openIn/menuArrowIsolation.test.ts` follows the existing mounted React tests. It transpiles and mounts the actual OpenInButton and apps adapter, supplies fake DOM refs and mutable activeElement, and invokes the mounted menu's onKeyDown.

Four baseline failures are expected. Already-prevented Down and Up must leave focus and the event untouched. Normal Down and Up must wrap focus and consume the event. Five controls preserve arrows with outside focus, unrelated keys, and Escape close/trigger-focus restoration both before and after prevention. All cases assert that navigation does not write preferences, copy or launch an app.

The fixture hash is sealed before any product fix. Existing tests and workflows are unchanged. Ordinary hosted frontend checks supply the failing-before result. No product fix is qualified until all four intended assertions fail and all five controls pass. Setup, compilation or loader failures do not qualify. The same frozen fixture must pass after the focused handler repair, and every exact-head check must pass before merge.

## Checks and limits

- `python3 evidence/open-in/menu-arrow-isolation/verify.py --baseline` checks source identity and fixture integrity while requiring unchanged product bytes. It does not execute behavior.
- Hosted behavior is NOT_RUN at preparation time.
- Test Behavior, Not Implementation determines the fixture boundary. Assertions observe focus, event consumption and external calls through the mounted public handler, rather than copied navigation logic.
- A fake event records propagation-stop calls. It does not prove propagation in an actual browser.
- Propagation stopping only affects later bubbling handlers. The document capture-phase keybinding listener is outside this claim.
- Native GUI, real editor activation and released installation acceptance are NOT_RUN. E1 retains the native execution lease. There is no screenshot because no new browser or native execution is admitted in this lane.
