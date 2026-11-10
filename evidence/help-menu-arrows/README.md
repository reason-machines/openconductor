# Help-menu arrow propagation

Conductor Rebuild owns only the `HelpMenu.tsx` arrow-handler hunk, the new
`helpMenuNavigation.test.ts`, and this evidence directory.

## Reference evidence

[Retained REA source receipt](reference.json) records the complete arrow callback,
its explicit Help-footer and popup binding, identity wrapper, exact artifact
ranges, supplied hashes, and source-owner message receipts. The complete bounded
function/binding receipt was received before drawing this conclusion.

In the retained Conductor renderer, `Nna` renders `KQo`; `KQo` binds its `xd`
callback as the popup's `onKeyDown`. That callback handles only ArrowDown/ArrowUp,
cycles focus, prevents the default action, and stops propagation. `xd=hEe` is an
identity wrapper. These are static observations, not browser/native verification.

OpenConductor's existing production callback cycles focus and prevents default,
but did not stop propagation for handled arrows. The fix adds only
`e.stopPropagation()` immediately after `e.preventDefault()`.

Home/End additions were rejected: this retained binding establishes no positive
Home/End behavior. Global/focus-manager/native behavior was not exhaustively
traced. No selectors, helper algorithms, styles, global handlers, palette,
backend or unrelated components are part of this change.

## Regression method

The new test extracts and executes the actual `onMenuKey` callback from
`HelpMenu.tsx`, using Node's built-in type stripping and the production `nextIndex`
import. It does not copy the callback or its focus-cycling algorithm. Popup
wiring is checked before executing the callback.

Minimal focus targets and a document/ref boundary stand in for the DOM. A real
Node `Event` exposes `defaultPrevented` and `cancelBubble`; the assertions require
both after handled arrows. Six explicit directional/middle/wrap cases also
require the expected target to receive focus exactly once. Other keys, empty
menus, absent menu refs, and focus outside menu items must remain unconsumed.

This proves the callback's effects, not React's event system, browser ancestor
listeners, popup mounting, native shortcut handling, or visual parity.

## Validation status

- Branch preflight passed: assigned branch retained; prior #781 is merged; clean
  worktree before starting; no open PR on this branch.
- Normal merge of main at `6725aad` encountered one existing-header import
  conflict in `WorkspaceView.tsx`. After explicit merge-only clearance, the
  resolution preserved that exact main file verbatim. The whole staged tree
  matched `6725aad` before the ordinary merge commit. [Merge receipt](merge.json)
  records the commit, identical blob, zero net diff and released file lease.
- The explicitly admitted `HELP423-BUILTIN-01` check ran exactly twice on this
  Session's actual Reason Cloud Linux computer 312
  (`5e65c154-305a-5bf6-b34c-990953472401`), with `nice -n 15`, a three-second CPU
  limit and a 30-second wall limit per foreground run.
- [RED, original TAP compressed](red.tap.gz): 8 tests, 2 passed / 6 failed. All six directional/wrap cases
  reached the correct focus target and prevented default, then failed with
  `handled arrows must stop propagation beyond Help`, `false !== true`.
- Applied only `e.stopPropagation()` after `e.preventDefault()` in the production
  callback. No test or helper changes between RED and GREEN.
- [GREEN](green.tap): the same command passed 8/8, zero failures.
- [Resource receipt](resource.txt): both memory/disk guards passed; the named slot
  was explicitly RELEASED immediately after the pair. No further runtime runs.
- Typecheck, build, installs, full suite, browser, screenshots, WebKit and native
  app checks NOT RUN locally under the resource restriction. No app/server started.

The original RED TAP is gzip-compressed to retain its diagnostic whitespace.
Decompression was compared byte-for-byte against the original before removing
the plain-text copy. No tests were rerun to package the evidence.

The exact command for both admitted runs was:

```bash
node --experimental-strip-types --test src/components/helpMenuNavigation.test.ts
```

No UI screenshot is supplied because browser/native execution is not admitted;
this source-only check must not be represented as visual or final parity proof.
