# Section picker: enabled keyboard selection

Conductor Rebuild / `PALETTE-SECTION-DISABLED-NAV-SAME15`.

## Reference contract and fresh-main reproduction

This is a bounded inert reading of the retained real Conductor 0.87.6 REA
renderer, not an app observation or reference execution. The complete retained
11,600,457-byte renderer rehashes to SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The verifier checks 16 complete, exact byte records against that parent:

- `h_a -> qZ -> Y5s -> KV -> P6=Xyi` connects the palette root.
- `m_a` actually enters `Jba` with the selected workspace/section key.
- `Jba` renders the current section through `$o` with `disabled: z.id === m`
  and its own looping `KV` root. `$o` forwards to `P6.Item=M5s`.
- `M5s` registers the item, renders `aria-disabled`, and withholds disabled
  pointer/click selection. `Xyi.K` uses `_Bn`, which explicitly excludes
  `[aria-disabled="true"]`. Initial/search selection `H`, endpoints `X` and
  arrow navigation `Q` all obtain candidates from this enabled collection.

Fresh main `1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5` instead used raw visible
section indices for keyboard navigation, reused the regular palette's active
index, and reset search selection to zero even if that row was disabled.
The current section could therefore be selected by initial entry, arrows,
Ctrl-J/K, Home or query reset, while its Enter activation remained guarded.

The fixture mounts actual OpenConductor `PaletteHost -> CommandPalette ->
MoveToSection` components and drives their real callbacks, including the Host's
`assignSection` consumer. External operations and icons are inert. The baseline
components are exported from the pinned main revision; adapter/state dependencies
are unchanged from main. It is not a reimplementation of the keyboard handler.

## Minimal change

Only `src/palette/CommandPalette.tsx` changes in production (16 additions,
6 deletions). Section selection has its own state, reset on query/entry key.
Visible row indices remain stable; keyboard movement maps through only enabled
indices, with no selection when no actionable row exists. The selected enabled
index also feeds the existing active-descendant and section renderer contracts.

The current row stays visible, checked and disabled. Regular palette navigation,
filtering, result ordering, pointer guards, IME suppression, back/close behavior,
New/Remove callbacks, keymaps, Home and WorkspaceActionsMenu are unchanged.
No helper or additional production path was introduced.

## Checks on Reason Cloud

- **RED:** export the three palette components from the pinned main into a
  temporary baseline, then run
  `PALETTE_FIXTURE_SOURCE_ROOT=file:///…/baseline/src/palette/ node --experimental-strip-types --test src/palette/sectionEnabledNavigation.test.ts`:
  **9 intended assertion failures, 12 passing controls**, exit 1.
- **GREEN, identical frozen fixture:**
  `node --experimental-strip-types --test src/palette/sectionEnabledNavigation.test.ts`:
  **21/21**, no skips. Fixture SHA-256 is
  `855ce5ff5e712d582ed86c1b1048f3d6c795ac103fba1dd59a1dde9b58ea59a4`.
- **PASS:**
  `node --experimental-strip-types --test --test-concurrency=2 src/palette/*.test.ts src/palette/search/*.test.ts src/keybindings/*.test.ts`:
  **415/415**, no skips. This includes all 14 frozen active-descendant cases and
  both supplemental disabled-pointer controls from #1417 without byte changes.
  No prior fixture needed migration and no selected-disabled assumption changed.
- **PASS:** `npm run typecheck` on the completed fixture, and `npm run build`
  in the isolated worktree: branding, typecheck, production compilation.
  The first primary-worktree build timed out after 180 seconds during Vite
  transformation; the isolated retry completed successfully (chunk-size advisory
  only). The timeout and successful retry logs are both retained.
- **PASS:** `python3 evidence/palette/section-disabled-navigation/verify.py`
  with the retained full-renderer argument: exact full-parent/span equality,
  disabled selection join, main baseline hashes, frozen fixture and RED counts.
- **PASS:** `git diff --check`.

## Integration after #1417 merged

Provider confirmation: #1417 merged at
`00bf65f92c31a5d355f6767ea3258f6af187baa2` on 2026-11-17 at 12:03:04Z,
with both executed automatic checks successful and five dispatch-only jobs
skipped. The isolated `aa1bcaa6` increment was then cherry-picked onto that fresh
main, keeping the #1417 head untouched and preserving all prior fixture bytes.

On this integrated baseline, the identical frozen fixture reproduced **12 passing
controls / 9 assertion failures**, then passed **21/21** on the candidate.
The integrated palette/search/keybindings suite passed **415/415**, and
`npm run build` passed branding, typecheck and production compilation (advisory
chunk-size warning only). The full retained renderer and all 16 source records
passed exact byte equality again. `integration.json` pins baseline/fixture hashes;
`integrated-*.gz` retains these reruns. No prior tests were migrated.

## Acceptance boundaries

Mounted source-unit tests are **not browser DOM or physical input/focus tests**.
Browser, VoiceOver/native accessibility, installed/containing-package identity,
and native side-by-side acceptance are **NOT_RUN**. No screenshot is supplied:
runtime/browser/native execution is excluded from this lane. Retained source
qualification does not prove a running installation's identity or behavior.
No vendor execution, new acquisition, app/provider/native/package dispatch,
installation, E2E run or watcher occurred. Existing package/native owners retain
those acceptance gaps. After the confirmed #1417 merge, publication targets main
in a separate ready PR, never a stacked PR.
