# Home Alt+Arrow date-group navigation

Conductor Rebuild / SAME271 — `HOME-ALT-ARROW-GROUP-NAVIGATION-271`.

## Change and scope

With Home Search focused, **Alt+ArrowDown / Alt+ArrowUp** now selects the first
row of the next / previous rendered date group. If there is no neighboring
nonempty group, navigation falls back to the adjacent row and clamps at the
list edge. With no results, the two shortcuts cancel without activation.
Meta+Arrow endpoint selection still takes precedence over Alt; Enter remains
the separate workspace activation path.

Only Search `onSearchKey` in `src/components/AllWorkspaces.tsx` changes. The
existing `groups`/`flat` row projection owns the group boundaries; there is no
new navigation state or shared abstraction. Plain arrows and lowercase Ctrl
letters still move by one row. Existing composition/consumed-event guards,
selection persistence, filtering, reveal effect, pagination, dispatch, pointer
handlers, CSS, palette and global bindings are untouched. Combined Ctrl+Alt
letters remain excluded: the existing Ctrl-letter predicate is unchanged.

Coordinator dcaa granted this exact three-path scope after the complete
contract and frozen portable RED were returned; ledger ddfc was notified.
Palette group navigation belongs to SAME15 and is not part of this repair.
The PR targets main, never the already-merged #1393. No prior open PR is
amended or stacked.

## Historical REA contract: same Home caller, not palette behavior

Fresh main was fetched again immediately before the product edit:
`da5d179229db0ed3333b98235310928038bd2a26` (#1393). Its Home component SHA-256
is `506ca08bed3e46b8478d2f90d60e1d0f5ddd7c4ddf2b379f4877a42e03692327`.
It selects adjacent flat rows for Alt+Arrow instead of using date groups.

[Reference manifest](reference.json) contains all **16 exact retained spans**,
UTF-8 half-open ranges, hashes, original kinds and text. Supplied UTF-16 range
lengths were checked as well. The complete same-asset chain is:

1. Home `UJo` maps its ordered, nonempty date groups through `iJn`. Each `iJn`
   renders `ff → P6.Group=j5s`; `j5s` creates the exact `cmdk-group` container
   selected by `Eve='[cmdk-group=""]'`.
2. Home `_Jo` renders `$o → P6.Item=M5s` without a disabled prop. `M5s` emits
   `cmdk-item`, `role=option` and `aria-disabled=false`. The exact `_Bn` selector
   identifies enabled items, so the group helper targets actual Home rows.
3. Home `KV` forwards its props to `P6=Xyi`. `UJo` supplies
   `shouldFilter:false` and `disablePointerSelection:true`; keyboard handlers
   are not replaced. `Xyi`'s Arrow handlers cancel the event and prioritize
   Meta endpoints, then Alt group helper `J`, then adjacent helper `Q`.
4. `J` starts at the selected item's `closest(Eve)`, traverses next / previous
   matching element siblings through complete `V5s` / `W5s`, and selects the
   first enabled item in the next nonempty group. Without one it calls `Q`.
   Cancellation occurs before selection even when there are no items.

Reference identity: Conductor 0.87.6 `renderApp-D_fmY7hW.js`, 11,600,457 bytes,
SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`;
REA parent
`ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
The whole renderer and installed application were **not reacquired or rehashed**.

The original Home endpoint spans were already retained here. The old
`ACQ-HOME-FILTER-01` archive (SHA-256
`85e870f20c7f90f300c57c813203db774e5b5a752ce8edd51639cb5f04c8a215`)
provided the Home group/item wrappers and complete group/item initializers.
SAME15 handed back only already-retained shared selector/helper declarations
from the **same asset identity**, including the exact `Eve`, `_Bn`, `V5s`,
`W5s` and P6 aliases. Those raw bytes were joined to the Home caller; no palette
regression, outcome or behavioral verdict is used as Home proof. Each recovered
span was locally rehashed and matched the original recorded ranges/hash.
Retained JavaScript was read as inert data, never executed.

This is a historical retained-source contract, not fresh native observation.
No new REA invocation or acquisition bug occurred. The existing semantic
analyzer/renderer heap gap remains unchanged.

## Test-first proof on Reason Cloud

The scratch qualification fixture was frozen at SHA-256
`74820f7f9cab3975dafda437342273bee0d022e9a69fe3c83aafadd7dd24baed`.
Only imports, types and the source loader were ported to the repository-relative
fixture. **All nine case bodies/assertions stayed byte-identical.** Before any
product edit, that portable fixture was frozen at SHA-256
`28690ba41c9a4cf66595c06832815ee151c211b8b70a8ed58ee12d759f12c874`.
The loader reads the real adjacent production component, not a pinned baseline.

```bash
timeout 90s node --max-old-space-size=512 --experimental-strip-types \
  --test --test-concurrency=1 src/components/homeGroupNavigation.test.ts
sha256sum -c evidence/home-group-navigation/fixture.sha256
```

- **RED reproduced:** [losslessly compressed raw receipt](red.txt.gz), exit 1,
  **4 controls passed / 5 assertions failed**. Three group-jump cases and the
  filtered-group case select an adjacent row instead; the empty-result case
  first fails because the event was not cancelled. There were no setup failures,
  cancellations or skips. Gzip preserves node:test's original whitespace.
- **Unchanged GREEN passed:** [raw receipt](green.txt), exit 0, **9/9**.
  The fixture digest still matches. The selected group row is also the Enter
  dispatch target in the three primary navigation cases.
- **Adjacent checks passed:** [raw receipt](adjacent.txt), exit 0,
  **182/182**, no failures/skips:

  ```bash
  timeout 120s node --max-old-space-size=768 --experimental-strip-types \
    --test --test-concurrency=1 src/components/allWorkspaces*.test.ts \
    src/components/home*.test.ts src/home/*.test.ts
  ```

- **Local typecheck failed, existing environment limitation:**
  [raw receipt](typecheck.txt), exit 2:

  ```bash
  timeout 120s node --max-old-space-size=2048 node_modules/typescript/bin/tsc --noEmit
  ```

  The sole diagnostic is existing TS2307 for missing `@tauri-apps/plugin-fs`
  in `src/features/chat/useWindowDragDrop.ts:20`, also recorded by earlier
  Home/header repairs. No installation, declaration shim or manifest change
  was made. Hosted installed-dependency typecheck/build is a separate
  exact-head CI requirement, not a local pass.
- **Passed:** `python3 evidence/home-group-navigation/verify.py`, immutable-main
  component pin, all 16 retained span hashes/ranges and caller joins, frozen
  fixture, lossless RED integrity, and `git diff --check`.

The regression mounts real React, production `AllWorkspaces` and real
KeybindingsProvider. Selection, filtering, row projection and activation are
not mocked. Adapters isolate unrelated preference/archive/decoration IO;
rendered Search callbacks receive cancelable Event objects. Four controls
cover no-neighbor fallback/no wrap, normal arrows/Ctrl letters, Meta priority,
and composing/already-consumed events. These are source-unit callback checks,
not physical-key or DOM-propagation tests.

[Machine-readable results](results.json) keep local typecheck limitations
separate from hosted checks. The qualified-v2 handoff archive SHA-256 is
`577e85b0d9270dc0e5672f7cd5868ba524fb5501f483ebabb6b0a316ffd9780d`;
its safe member readback, fixture and raw RED digests passed before delivery.

## Deferred acceptance: browser/package/native NOT_RUN

No screenshot is available because this lane has no app/browser/native
execution admission. No server, app launch, native/REA acquisition, package
build/install, provider turn, replacement executor, workflow dispatch/rerun or
new watcher was started. The existing sole 09:36 UTC package check is unchanged;
identified-build native acceptance stays with the sole existing executor and
its disposable-profile/isolation gate.

On a verified consuming build, acceptance still needs to:

1. Record build identity and source containment before testing behavior.
2. Render at least two date groups with multiple rows each. Focus Home Search;
   verify Alt+Down/Up selects the neighboring group's first row without opening
   it, including filtered groups and empty results.
3. Verify no-neighbor fallback/clamping, Meta endpoint priority, ordinary arrows,
   Ctrl letters, IME and consumed events; verify Enter opens the selected row.
4. Observe actual keyboard/OS interception, selected-row visibility, scroll
   containment and visual parity separately. Source-unit GREEN does not prove
   those properties or combined Ctrl+Meta/Alt-letter behavior.
