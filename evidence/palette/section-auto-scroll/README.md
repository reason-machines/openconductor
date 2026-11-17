# Section-picker keyboard scrolling

Conductor Rebuild / `PALETTE-SECTION-AUTO-SCROLL-SAME15`.

## Retained REA contract

The retained real Conductor 0.87.6 renderer is 11,600,457 bytes, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
`source.json` identifies 20 exact half-open byte records; the verifier checks
those bytes against the full retained parent without executing vendor code.

The actual section path is `m_a -> Jba -> KV/P6=Xyi`; `Jba` renders `L6`, which
forwards to `P6.List=$5s`. That list binds `u.listInnerRef` to its own inner
container. Root `G()` queries that container's selected option, and `z()` calls
`scrollIntoView({block:"nearest"})` on it. Keyboard arrows/Ctrl-J/K and
Home/End/Meta-arrow endpoints call root `Q`/`X`, then `P.setState("value", ...)`
without the third suppression parameter. Value changes enqueue `D(5,z)`;
`G5s` flushes the scheduler map through `DJ` (layout effect in the browser).
Thus the scroll consumer is reachable from keyboard selection, not just pointer
code or a disconnected helper. Item `M5s` passes `true` as the third argument for
pointer selection, deliberately withholding that scroll request.

The positive pointer-to-Zeta observation from a prior diagnostic was not used as
keyboard proof. No speculative dependency-only patch, self-regression diagnosis
or prior navigation reversion is justified by that observation.

## Actual mounted RED

Fresh main `c3c9ab420f62edb08159f6bcbbcc921ca57f52f3` has a separate section
list inside `MoveToSection`, while the existing palette scroll effect references
only the ordinary list. The test mounts actual `PaletteHost -> CommandPalette ->
MoveToSection` and drives the real keyboard callbacks; selections succeed, but
none of 11 keyboard/filter transitions requests a scroll from the section list.

`src/palette/sectionAutoScroll.test.ts` is frozen at SHA-256
`29d14849c86f6bd8f4bd4389f9b1eb6ee7b791e89dc235a9560d32e96de42220`.

Export the three baseline components to a temporary directory and run:

```bash
PALETTE_FIXTURE_SOURCE_ROOT=file:///path/to/baseline/ node --experimental-strip-types --test src/palette/sectionAutoScroll.test.ts
```

Result: **7 passing controls / 11 intended ERR_ASSERTION failures**, no skips,
exit 1. Each failure occurs after the expected selection is verified and reports
an absent selected-option nearest-scroll call. The same frozen fixture on the
#1424 candidate also gives 7 passing controls / 11 identical scroll failures,
so the issue is independent of that disabled-navigation repair.

Controls retain ordinary-list scrolling, composition suppression, enabled pointer
highlight without scrolling, disabled pointer callbacks, empty/disabled-only
results, and the actual Host assignment consumer. The list double is scoped to
its own mounted list and cannot claim a detached ordinary list is the section
list. Typecheck of the fixture passed on Reason Cloud.

## Minimal fix and fresh-main integration

Only `src/palette/MoveToSection.tsx` changes production behavior (19 additions,
3 deletions). Attach a ref to the actual section list and scroll its selected
option with `block: "nearest"` when the selected item key changes. Using the item
key handles filtered result replacement at the same numeric index. Pointer
selection suppresses only its own update; hovering the already selected row
cannot leave a suppression flag for the next keyboard update. No
CommandPalette, CSS, shared keymap or helper changes.

Predecessor #1424 actually merged at
`5c12f27036aec2e75e8a3dc80d462f0fd249680e` before integration. Fresh main
`93b9d53ce02970967a831b0ac93ecdbf17bdea31` still reproduces **7 passing
controls / 11 intended assertion failures** with the identical frozen fixture.
The same fixture passes **18/18** after the fix. Three supplemental pointer
cases pass, including same-selected hover -> keyboard and changed hover ->
keyboard, giving **21/21** focused tests with no skips.

The old adjacent run was **413 passing / 1 loader failure**, not a passing suite:
`activeDescendantControls.test.ts` rejected MoveToSection's new React hook
import before its two tests could execute. The sole harness change adds
`name === "react"` to its existing real-dependency allowlist. All test bodies
and assertions remain byte-identical; React is not stubbed. Its original bytes
are archived losslessly in `active-descendant-controls-before.test.ts.gz`:
SHA-256 `5b9a99dd3ca663af5c473a24287c317615480938e1d99c4b2c20d54fa741a4cd`.
The one-line-adapted file hashes to
`a578b2cbb8b26e62b24754711885be0117c72c8dce4c5c22d3ddfdeef2ff32cd`.
No selected-disabled policy or assertion was migrated. All 14 original ARIA
cases and 21 disabled-navigation cases retain exactly their main bytes.

Fresh integrated checks on Reason Cloud:

- **PASS:** unchanged frozen regression plus pointer supplements, **21/21**.
- **PASS:** palette/search/keybinding suite, **433/433**, no skips. Includes
  original ARIA/disabled-selection controls with their real React dependency.
- **PASS:** `npm run build`: branding, TypeScript and production compilation;
  advisory chunk-size warning only.
- **PASS:** 20 exact retained records against the complete retained parent,
  pointer/keyboard/list/scheduler closure and frozen fixture integrity.
- **PASS:** source/whitespace checks and four lossless integration-log roundtrips.

`integration.json` pins the baseline, protected fixtures, candidate and one-line
adapter. Compressed fresh RED/GREEN/adjacent/build logs are in `integration/`.
The earlier isolated logs remain intact and explicitly labeled in `source.json`.

## Acceptance boundary

These are mounted React callback/effect/ref observations with synthetic host
nodes, not browser DOM, viewport visibility, native keys/focus, VoiceOver,
containing-package identity or installed-app behavior. All those acceptance
categories remain **NOT_RUN**. Runtime/browser/native/package dispatch is excluded
from this lane, so no screenshot is supplied. No app/provider/vendor execution,
new reference acquisition, installation, E2E/job dispatch or watcher occurred.
Existing Home271/SAME992 package/release custody retains release inclusion and
native acceptance. The isolated worktree does not modify #1424's published head.
