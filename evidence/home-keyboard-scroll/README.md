# Home keyboard selection reveal

HOME-KEYBOARD-SCROLL-INTO-VIEW-271. Conductor Rebuild / Home271.

## Measured source and ownership

The baseline is fetched main `b22fa9adaf67fa79fc3dddf72914cae01f352b08`.
Its `src/components/AllWorkspaces.tsx` SHA-256 is
`22ac2e190bcfab6a02b86d6f4d3ae74990a4965e428f76fef63654f728eca1b0`.
It updates `activeKey` in `onSearchKey` and renders a selected option, but has no
selected-row ref or scroll call. Source absence alone does not observe an
offscreen row in a running app.

Ledger ddfc6518 granted only `AllWorkspaces.tsx`, the new
`homeKeyboardScroll.test.ts`, and this evidence directory. Owner 9e935d73 also
confirmed non-overlap: #820's wheel/fixed-shell/pane containment fixture is
complete and does not own Home's keyboard selection handler. No runtime or
native lease was granted. This repair must not be published into #1382;
separate ready-main delivery follows that PR's subscribed merge. The provider
confirmed #1382 merged as `000bef1491c08a67ec3749b9a3454403f307894f`.
Before this separate publication, main was fetched and merged into the assigned
branch at `bcb3ce4f0c0cf92f6a238c1cc6e4d0d54856a24f`. Its Home component has the
same baseline SHA-256 above, so the reproduced missing reveal remains present;
no header or composer change is part of this repair.

## Historical REA contract

[Reference manifest](reference.json) pins the retained real-Conductor 0.87.6
renderer identity, parent REA receipt, seven endpoint spans, the separate P6
binding, and exact literal fragments. All eight supplied span hashes and byte
lengths were checked; the seven endpoint UTF-16 range lengths were also checked.
The full renderer digest is inherited from the retained receipt, not freshly
measured. Reference JavaScript was treated as data, never executed.

The complete Home caller `UJo` mounts `KV` with `shouldFilter:false` and
`disablePointerSelection:true`. `KV` forwards to `P6`; the separately retained
binding is exactly `P6=Object.assign(Xyi,{...})`.

In `Xyi`, initial mounting schedules `z`. Keyboard endpoint/index and adjacent-row
helpers call `setState("value", ...)` without the skip-scroll argument. A changed
value schedules `z`, whose final operation is the selected item's
`scrollIntoView({block:"nearest"})`. For the first item in its parent, `z` first
queries `closest(Eve).querySelector(P5s)` and reveals that element. Home's retained
`iJn` date-group code supplies a heading and styles `[cmdk-group-heading]`.
The exact `Eve`/`P5s` selector declarations are not included in these receipts;
the date-heading mapping is a source-level interpretation, not an independently
observed native result.

The bounded implementation adds a list-scoped ref and a post-commit effect keyed
by the actual selected key and loading state. It reveals the first row's date
heading, then that selected row, both with `block:"nearest"`. Existing keyboard
selection, cancellation, activation, filters, pointer handlers, pagination,
CSS, and dispatch remain untouched. Stable selection does not repeatedly scroll
on unrelated renders.

## Frozen regression and results on Reason Cloud

The mounted production-component regression is frozen at SHA-256
`85dd53c167303f33f520d37830a3ff62fcd389ace61c0bc8583879e49532358a`.
An initial fixture query matched the shared word "Workspace"; it was changed to
a unique existing fixture name before freezing and before any product edit.
The final RED and GREEN use the identical frozen test.

```bash
timeout 90s node --max-old-space-size=512 --experimental-strip-types --test --test-concurrency=1 src/components/homeKeyboardScroll.test.ts
```

- **RED reproduced:** [raw compressed receipt](red.txt.gz), exit 1, 3 passed /
  5 failed. Failures are missing scroll requests after real mounted
  selection/loading changes, not missing modules or harness errors. Decode with
  `gzip -dc evidence/home-keyboard-scroll/red.txt.gz`; compression preserves
  the diagnostic's original whitespace without introducing patch whitespace.
- **GREEN passed:** [receipt](green.txt), exit 0, 8 passed / 0 failed.
- **Adjacent passed:** [receipt](adjacent.txt), 94/94, using the same Node options
  with a 768 MiB limit and `homeKeyboardScroll.test.ts`, `allWorkspaces*.test.ts`,
  and `src/home/*.test.ts`.
- **Integrated passed:** [receipt](integrated.txt), 164/164, using the same options
  and `src/components/allWorkspaces*.test.ts src/components/home*.test.ts src/home/*.test.ts`.
- **Fresh-main integrated check passed:** [receipt](integrated-current-main.txt),
  164/164, no failures/skips, on integrated main `bcb3ce4f0c0cf92f6a238c1cc6e4d0d54856a24f`:

  ```bash
  timeout 120s node --max-old-space-size=768 --experimental-strip-types --test --test-concurrency=1 src/components/allWorkspaces*.test.ts src/components/home*.test.ts src/home/*.test.ts
  ```

  All eight retained source spans, eight literal fragments, two reference
  receipts, the frozen test hash and fresh-main Home source hash were reverified.
- **Typecheck failed:** [original diagnostic](typecheck.txt) and the
  [fresh-main rerun](typecheck-current-main.txt), both exit 2 from
  `timeout 120s node --max-old-space-size=2048 node_modules/typescript/bin/tsc --noEmit`.
  The sole diagnostic is missing existing `@tauri-apps/plugin-fs` in this
  checkout's dependencies, also recorded by #1382. No dependency was installed
  or manifest changed. Hosted installed-dependency typecheck/build is a separate
  exact-head gate.
- **Whitespace passed:** `git diff --check`.

The tests mount real React hooks and the production Home handlers, row ordering,
and filtering. Adapters isolate unrelated IO/preferences/icons. A list DOM-node
spy derives the selected row and group from the actual rendered component tree;
it records scroll call targets/order/options. It does not measure layout,
scroll offsets, visibility, browser event propagation, or scroll containment.
Coverage includes initial selection, adjacent rows, first/non-first date-group
rows, Home/End/meta-arrow endpoints, unchanged selections/renders, search/no
matches, empty rows, loading completion, composition/consumed-event controls,
and unchanged Enter dispatch.

## Deferred acceptance — browser/package/native NOT_RUN

No screenshot exists: browser, product runtime, package and native execution
are not admitted to this lane. No Mac/native dispatch, server, install, provider
turn, workflow dispatch/rerun, or REA reacquisition occurred. Existing REA
semantic-analysis heap-exhaustion limitations are unchanged.

The existing sole native executor retains later identified-build acceptance:

1. Verify a package contains this repair and record its source/build identity;
   use the already-required disposable, isolated profile.
2. Populate enough Home rows to overflow, including multiple date groups. Keep
   keyboard focus in Search and record ArrowDown/ArrowUp and Home/End/meta-arrow
   selection across the viewport boundaries. The selected row must remain in
   view; entering a group's first row should retain its heading when possible.
3. Confirm plain Enter opens only the selected workspace, while navigation does
   not. Check search/no matches, empty lists, loading completion, IME and
   consumed-event guards. Unchanged selections must not keep nudging scrolling.
4. Check fixed header/body and pane containment, pointer opening and pagination
   remain intact. Source-unit scroll spies do not establish any of these native
   or visual properties.

Exact missing retained capture for stronger heading attribution: the immutable
renderer declarations assigning `Eve` and `P5s`, with their byte ranges/hashes
and relation to command group/heading nodes. This is not authorization to obtain
new native evidence or to replace the sole executor.
