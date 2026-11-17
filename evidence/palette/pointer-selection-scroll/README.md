# Pointer-selected palette rows must not request scrolling

Conductor Rebuild / `REGULAR-PALETTE-POINTER-SCROLL-SAME15`.

## Original contract and complete joins

The retained real Conductor 0.87.6 renderer is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
`source.json` pins 23 complete source records (60,455 bytes) by exact half-open
UTF-8 range and digest. `verify.py` compares them against the complete parent
without evaluating vendor JavaScript.

The ordinary palette's real caller is `h_a -> qZ -> Y5s -> KV -> P6/Xyi`.
`h_a` passes only `filter:wUi`; pointer selection is not disabled. `m_a` renders
ordinary command/project/settings rows with `$o`, and recent workspace rows with
`Vba -> $o`. Its Workspaces tab renders `l_a -> aYe -> $o`. Both ordinary and
workspace lists use `L6 -> P6.List/$5s`. `$o` forwards to `P6.Item/M5s`.

`M5s` changes the selected value through `P.setState("value", ..., true)` on
pointer selection, withholding the scroll request through root `de || D(5,z)`.
The same root's keyboard `Q`/`X` changes value without that flag, so `G5s`/`DJ`
flushes `z`, querying its actual list's selected option and requesting
`scrollIntoView({block:"nearest"})`. Disabled items have no pointer selection
handler. This contract is distinct from section-picker scrolling (#1428).

These are retained REA source observations, not a fresh real-app interaction,
new source acquisition, generated call graph or vendor-code execution.

## Frozen mounted RED

Fresh main checked: `810a79d40a7205a52e730ae5cc6da2f84401c063`.
The test mounts the actual `PaletteHost -> CommandPalette` and real
`WorkspacesTab`/`WorkspaceRow` components, then drives their observed callbacks.
The list-node double records nearest-scroll requests; it does not supply real
DOM geometry. External app/provider/mutation operations throw if unexpectedly
reached; only synthetic data is used.

The 15-case fixture is frozen at SHA-256
`1f7f9be48228daf8aa0f516f341b1548294ab36a06d07947c951b1f3a301cd4d`:

```bash
node --experimental-strip-types --test src/palette/palettePointerScroll.test.ts
```

On unmodified main: **10 passing controls / 5 intended assertion failures**, no
skips, exit 1. The five failures prove that pointer movement selects its target
then requests an unwanted scroll in All, Actions, Projects, Settings and
Workspaces. Controls verify subsequent keyboard scrolling in every tab,
same-selected hover followed by keyboard movement, actual Enter activation,
composition suppression, disabled/no-result rows and the disabled current
section. The frozen final RED log is `red.tap.gz`; the initial development runs
were not the frozen baseline and are not included as accepted results.

## Minimal repair and isolated checks

Only `src/palette/CommandPalette.tsx` changes production behavior (12 additions,
3 deletions). A local pointer-source ref suppresses its own selected-option
scroll once. A shared callback sets that marker only when the index changes,
then updates selection; it is used by the existing workspace hover callback and
ordinary result mouse callback. The existing keyboard/filter/tab paths still
set selection normally. The effect consumes the pointer marker at most once.
No helper, CSS, WorkspacesTab or shared keymap changes.

The unchanged frozen fixture passes **15/15**. Four separate supplemental
query/tab-transition controls pass and preserve the same-selected guard without
changing a byte of the frozen fixture.

```bash
node --experimental-strip-types --test --test-concurrency=1 $(find src/palette src/keybindings -name '*.test.ts' -type f | sort) evidence/palette/pointer-selection-scroll/pointer-transition-controls.test.ts
npm run build
python3 evidence/palette/pointer-selection-scroll/verify.py /path/to/retained-renderer.js
```

- **PASS:** affected palette/search/keybinding suite and four supplemental
  controls, **434/434**, no skips.
- **PASS:** branding, TypeScript and production compilation via `npm run build`;
  existing advisory chunk-size warnings only.
- **PASS:** all 23 retained records, full parent identity, frozen fixture digest
  and explicit caller/item/root/list/scheduler joins.

All checks above ran on Reason Cloud in an isolated worktree based on the stated
main commit. Compressed GREEN, adjacent and build logs accompany the source
packet. The successor stayed isolated while #1428 was open.

## Confirmed-merge integration

#1428 actually merged at `08be22cfcb0034e23171fe9b5f3b0a5df93585f3`
on 2026-11-17 at 13:04:13Z. Only after that confirmation, its fresh main was
merged into this Session's assigned branch and the isolated two-commit successor
was replayed. This is a separate ready PR against main, not stacked or appended.

On that exact fresh-main baseline, the same frozen 15-case fixture again gave
**10 passing controls / 5 intended assertion failures**. With the minimal fix,
the unchanged fixture plus four query/tab-transition controls passed **19/19**;
the integrated affected suite passed **452/452**, with no skips. `npm run build`
passed branding, TypeScript and production compilation. The increase from the
isolated 434 checks comes from the 18 section-scroll cases now present on main.

`integration.json` pins the fresh main, checked candidate, actual predecessor
merge, unchanged existing fixtures and lossless integrated RED/GREEN/adjacent/
build logs. The original 14 ARIA, 21 disabled-navigation and 18 section-scroll
fixtures and existing supplemental control files remain byte-identical to main.
The verifier checks these pins and log summaries as well as the retained source
contract. No helper, CSS, WorkspacesTab or shared-keymap expansion was needed.

## Acceptance limits

Browser geometry/viewport visibility, physical pointer/keyboard behavior,
native accessibility, installed-app identity, containing-package inclusion and
provider execution are **NOT_RUN**, not passes. No screenshot is provided
because this lane is restricted to source/mounted-callback checks. No runtime,
app launch/install, E2E/package dispatch, new reference acquisition or duplicate
watcher occurred. Existing release custody remains responsible for package
inclusion and native acceptance.
