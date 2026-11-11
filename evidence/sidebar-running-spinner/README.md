# Sidebar running spinner

Scope: Sven's requested clean running-session spinner (UI item 2), not an exact Conductor shape-parity claim.

## Source and design

`RowStatusIcon` previously drew three filled circles for every busy status (`setting-up`, `working`, `cancelling`, `waiting`), with staggered opacity animations. It now draws exactly one outline arc and rotates the whole SVG. The existing 14px size, 24px outline viewBox, 2-unit stroke, round caps/joins, inherited status colour and accessible parent label are retained/consistent with the other outline status icons. Reduced-motion users see the same static arc, without rotation. Other icon shapes, status precedence, matrix mode and terminal/setup dots are unchanged. Home also consumes this shared status icon.

## REA reference limits

The sole native executor (`e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46`) reported on 2026-11-08 that REA `observe-native-ui` against the real `/Applications/Conductor.app`, exact CGWindow 82016, was denied Screen Recording access. No fallback input or competing app launch was attempted. The existing Conductor workspace contains a nonempty draft/attachment and was preserved; no reference turn was started.

Retained `evidence/rea/session-status.md` establishes busy-status selection, but not the spinner's precise shape. The initializing-specific setting-up loader evidence is not evidence of the working spinner. The outline arc is Sven's explicit requested design; this change does not assert it reproduces a measured Conductor running glyph. No new REA tool bug is established beyond the observed permission gap.

## Verification

- Before fix: the seven rendered-icon/CSS regression tests had five failures (the four busy states still rendered dots; rotation CSS absent), two controls passed.
- After fix: `node --experimental-strip-types --test src/components/RowStatusIcon.test.ts src/state/rowStatus.test.ts` passed 16/16.
- `npm run build` passed (branding, TypeScript, production frontend bundle; existing large-chunk warning).
- `npm run typecheck` passed after adding the CI-discovered `.test.ts` regression file.
- `npm run lint:colors` passed 6/6 tests and source scan.
- `git diff --check` passed.

Actual native main-build screenshot of an actively running session, exact containing-main package/build identity and release step are pending the sole native executor. No browser render or static-markup test substitutes for that proof. Evidence will be linked in the PR after capture and inspection.
