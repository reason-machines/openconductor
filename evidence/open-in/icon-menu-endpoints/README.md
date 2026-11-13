# Icon-only Open in menu endpoint keys

Conductor Rebuild retained a source-only Home/End correction against main `09b1c998acb093f4d905d5ef844c80136ea987f6`. No product file changes in this increment. The candidate and test remain inert files under [source-v1](source-v1).

## Reference route

The retained Conductor 0.87.6 renderer has SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its lineage includes existing REA evidence `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`. This investigation reads those retained bytes, not the running original app. [The manifest](source-v1/manifest.json) records exact UTF-8 spans and hashes.

`P9` has two different menu paths. The icon branch renders `h2` and `Tm`, with `cFn` supplying app items and Copy path. `h2` creates `oF`, which publishes its `popupProps` through `JSe`. `Tm` renders `m2`. That popup reads the same menu store through `f5` and applies those props. `oF` merges `SLt.floating` into the popup handlers. Its item collection registers `Pu` elements in DOM order.

`SLt` consumes Home and End with both `preventDefault()` and `stopPropagation()`. It selects the first or last enabled item and focuses that item. It ignores legacy IME code 229. Its `c8t` exception concerns a combobox trigger. The icon branch's `Sg` and `Ede` create a menu button, not that combobox. The retained handler merger keeps the base handler unless `preventBaseUIHandler()` cancels it. `Tm` does not cancel ordinary in-menu Home or End events.

The default split branch instead renders `E1`, a popover, with `xd(_vs)`. `_vs` only handles ArrowUp and ArrowDown. Applying the dropdown's endpoint behavior to the split menu would change the wrong contract.

## Proposed change

At the checked main, `OpenInButton.onMenuKey` handles Escape and arrows for both variants. [The sealed candidate](source-v1/candidate.diff.gz) adds endpoint navigation only when `variant="icon"`, from a focused enabled menu row. It leaves the Escape branch, app launch, Copy path, shortcuts, and render tree unchanged. It adds no shared menu abstraction or state. The lossless gzip file keeps the original patch bytes without Git interpreting blank patch context as trailing whitespace.

Typeahead and endpoint events originating from the menu container are outside this candidate. The source route also contains typeahead, but this increment makes no implementation or parity claim about it.

## Prepared checks

[The frozen proposed fixture](source-v1/iconMenuEndpoints.test.ts.txt) mounts the actual `OpenInButton` and loads the actual app adapter through the existing React-renderer test pattern. It mocks DOM focus nodes, installed apps, preference writes, and the native IPC boundary. It is not a browser focus test.

Fourteen cases are prepared. Four endpoint cases are predicted to fail before the candidate. Ten controls cover split Home/End, already-prevented endpoint events, legacy IME, wrapped icon arrows, unchanged Escape, and exact app-launch and clipboard calls. These are predictions from source, not observed test results. The positive click control checks that the side-effect recorder can observe writes and launches.

The new fixture has not been staged into `src`. Existing tests, the accepted active-file original twelve plus three lifecycle controls, M11, and other owners' frozen inputs remain unchanged.

## Verification state

`python3 evidence/open-in/icon-menu-endpoints/source-v1/verify_source.py --asset .oc-tmp/refill-1240/reference/renderApp-D_fmY7hW.js` checks reference identities, source joins, the unchanged current-main baseline, and patch applicability in a temporary Git index. It does not execute the product, fixture, or extracted Conductor code.

Baseline, candidate, adjacent tests, typecheck, build, browser, native, and package checks have not run. There is no screenshot because no app execution was admitted. Any eventual behavioral run must use the sole existing execution owner. This source increment creates no queue entry, admission, runner, watcher, or change to the accepted active-file position after composer135.

The behavior checks must produce a qualifying baseline assertion failure before product application, then a candidate pass with the identical fixture and adjacent controls. A ready main-based product PR and green exact-head workflows remain future delivery work, not outcomes of this packet.
