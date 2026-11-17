# Palette Option-arrow group navigation — SAME15

Conductor Rebuild / SAME15. Gap label: `PALETTE-GROUP-NAVIGATION-SAME15`.
This is a regression-first source fix, not mounted UI proof or native acceptance.

## Retained real-Conductor proof

Conductor 0.87.6 renderer `renderApp-D_fmY7hW.js`, 11,600,457 bytes,
SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
BE7 freshly rehashed the complete already-held renderer. SAME15 independently
rehashed all 12 delivered raw spans from packet SHA-256
`a53245ce867757b163a8bdbe0ca7bf815f0007876a7e3c86cd61b09adc5fb408`,
and six existing retained wrapper spans. This Session did not rehash the full
renderer, acquire new reference bytes, or execute extracted reference JS.

`retained-manifest.json` records exact zero-based half-open UTF-8 byte offsets,
lengths, and hashes. `source.json` indexes the wrapper lineage and raw input
consumer. The complete raw `m_a` is 31,704 bytes with SHA-256
`cd07cfad2d86afe0717c73433656bd3f8d144b8e84dfd2368646ded0f30d1c3e`;
this must not be equated with the earlier formatted tool-read-record hash.

The closed reference chain is:

- `h_a → qZ → Y5s → KV → P6=Xyi`; `Y5s` sets `loop=true`.
- `m_a → kI → P6.Input=B5s` forwards input props, with no input `onKeyDown`
  override in the complete retained `m_a`.
- `Xyi` routes Down/Up through `Z`/`se`: Meta selects an endpoint; otherwise
  Alt invokes `J(+1)` / `J(-1)`; otherwise ordinary row movement is `Q`.
- `J` finds the current item's closest `Eve` group, traverses sibling groups
  using `V5s` / `W5s`, and selects the first `_Bn` (non-disabled item) in the
  next/previous nonempty group. Previous-group movement selects its **first**
  enabled row, not its last.
- Without an eligible sibling group or selected row it falls back to ordinary
  row movement `Q`, including whole-list wrapping. It does not wrap groups.

## Current-main RED

Fresh default-branch head checked: `c821b27519ab1831cf62dce6d236337bf75cc3e0`.
Both palette production files exactly match this main head; snapshots and
hashes are recorded. `paletteCommandFor` excludes Alt-arrow routing, and
`CommandPalette` supplies only flat counts to `moveActive`, losing group
boundaries.

Frozen fixture: `src/palette/paletteGroupNavigation.test.ts`; identity is pinned
in `fixture.sha256`. It executes the actual OpenConductor `onKeyDown` function
from the actual component, stripped of TypeScript annotations by Node, with
actual palette state functions. Only surrounding component state/event/selection
boundaries are synthetic. No React mount, DOM rendering, reference JS execution,
product backend, provider, guest, browser, native IPC, or dispatcher is started.

```bash
node --experimental-strip-types --test src/palette/paletteGroupNavigation.test.ts
python3 evidence/palette/group-navigation/verify.py --baseline
```

Observed RED: **18 expected assertion failures, 18 controls pass** (36 tests,
exit 1). All failures are Option-arrow target/consumption assertions, not
imports, dependencies, syntax, or fixture setup. Cases exercise sibling groups,
empty disabled-result groups, previous-group first-row selection, edge fallback,
wrap, no selection, empty list, Workspaces active/Archived groups, and single-group
Projects. Controls cover ordinary arrows/endpoints, Ctrl N/J/P/K, composition
and legacy 229, Enter, Escape, custom Option tab shortcut, and unrelated input.

Adjacent existing state tests: **9/9 pass** with
`node --experimental-strip-types --test src/palette/state.test.ts`.

## Leased implementation

- `src/palette/state.ts`: map Option Up/Down to group movement; extend the existing
  movement helper with optional visible group lengths. Preserve ordinary movement
  as the fallback when no eligible sibling group exists.
- `src/palette/CommandPalette.tsx`: pass displayed group lengths for the regular
  palette (`groups`) or Workspaces active/Archived groups (`wsRows`). The current
  flat-count-only call cannot implement the evidenced behavior.
- Existing new fixture and this evidence directory only; no unrelated files.

Ledger granted this exact implementation lease after independently verifying
source closure and frozen RED. Fresh main rechecked before implementation:
`ee4f981836fde3e3a2ed3eeb3aefd38dd2e4e571`; both production files still exactly
match the recorded `c821b275` snapshots. `red-recheck.tap.gz` reproduces the same
18 assertion failures and 18 passing controls on those bytes. Both RED TAP logs
are gzip-compressed without changing their original bytes (assertion output has
intentional whitespace); uncompressed identities are in `red-log-identities.json`.

The minimal implementation adds two group commands and optional visible group
lengths to the existing movement helper. Existing explicit shortcut bindings
retain priority over the new Option-arrow fallback. The regular palette supplies displayed
group lengths; Workspaces supplies active/Archived lengths. Empty groups are
ignored, sibling movement selects the first row, and a missing sibling falls
back to the existing wrapping one-row command. The section-mode handler ignores
only the two new commands before preventing the event; its existing selection
and movement branch is byte-for-byte unchanged.

## Post-fix verification

- **PASS:** unchanged frozen fixture `b89d551dba77bb2f3eb0c6d1a7590d84190f428af77a891a96aaa7f54fe3c52c`:
  **36/36**, no skips, `green.tap`. Command:
  `node --experimental-strip-types --test src/palette/paletteGroupNavigation.test.ts`.
- **PASS:** supplemental section-preservation controls, **14/14**, no skips,
  `section-controls.tap`. Command:
  `node --experimental-strip-types --test evidence/palette/group-navigation/section-preservation.test.ts`.
  This separate fixture covers ignored Option arrows, existing row/Meta/Ctrl
  navigation, Escape/Backspace, query editing, Enter and composition. It does
  not change the frozen 36-case regression.
- **PASS:** supplemental explicit-binding controls, **5/5**, no skips,
  `binding-controls.tap`. Command:
  `node --experimental-strip-types --test evidence/palette/group-navigation/binding-controls.test.ts`.
  Existing custom Option-arrow tab/close bindings retain precedence; unbound
  Option arrows use group navigation. These caught and corrected an initial
  local implementation ordering mistake (three binding assertions failed before
  moving the fallback behind existing shortcut resolution).
- **PARTIAL / dependency setup failures:** the broad adjacent command
  `node --experimental-strip-types --test src/palette/*.test.ts src/palette/search/*.test.ts src/keybindings/*.test.ts`
  passed **183** tests; **16 test files failed import/setup** because this checkout
  has no dependencies (`react`, `typescript`, `fuzzysort`, Tauri API, diffs).
  See `adjacent.tap`; none were assertion failures and no tests were disabled.
- **PASS:** all available dependency-free adjacent files, **183/183**, no skips,
  `available-adjacent.tap`; exact file list and command are recorded in
  `available-adjacent-command.txt`. This is a partial subset of broad coverage,
  not a claim that all palette/keyboard tests passed.
- **PASS:** source/fixture integrity via `python3 evidence/palette/group-navigation/verify.py`,
  including 12 raw spans, six wrappers, frozen fixture, RED and GREEN receipts,
  and unchanged existing section branch.
- **PASS:** `git diff --check`.
- **NOT_RUN locally:** typecheck and build; no local dependencies or TypeScript
  executable are available, and dependency installation is excluded. Hosted
  exact-head CI is still required before merge.

## Separate main-based publication after #1381

PR #1381 merged as `ec12f949c5f407d771bfa27acff858e77654ff3c`.
That exact fresh main was merged into this assigned branch without conflicts.
Both palette files at that main commit are byte-identical to the frozen RED
snapshots. The net delivery diff contains only the leased palette files,
the unchanged regression, and this new evidence directory; it does not carry
any additional Open in changes.

On the recomposed candidate, the same commands above passed again:
**36/36** frozen regression, **14/14** section controls, **5/5** explicit-binding
controls, and **183/183** available adjacent tests. Fresh TAP receipts use the
`recomposed-` prefix. The frozen fixture hash remains
`b89d551dba77bb2f3eb0c6d1a7590d84190f428af77a891a96aaa7f54fe3c52c`.
Reference/fixture integrity and `git diff --check` passed again. Local
typecheck/build remain NOT_RUN because dependencies are absent and installs
are excluded; automatic hosted exact-head CI must pass before merge.

Typeahead, icon triggers/split menus, section UI/selection changes, global
keyboard interception, broad modifier combinations and unrelated navigation
are outside this unit. No claim is made about their parity.

Browser/native/package acceptance: **NOT_RUN**. No screenshot: this is an
explicitly source-only unit and no app/browser/native runtime was admitted.
