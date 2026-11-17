# Composer suggestion pointer — `COMPOSER-SUGGESTION-POINTER-135-01`

## Gap

SlashMenu and FileMentionMenu previously used `onMouseMove`, which re-selects
any row on every pointer movement even when the pointer did not change rows.
Conductor's compiled renderer (`renderApp-D_fmY7hW.js`, SHA-256
`5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`) uses
`onMouseEnter` gated by a document-level pointer-readiness check (`y8i`, `Jxo`,
`t5o`, `lHt`): the hook starts unready, observes one document `mousemove`, then
enables row-enter selection. Readiness resets when a previously-empty menu
becomes non-empty.

## Source evidence

Retained evidence ID: `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`
(full analysis at `evidence/frontend/rea-analyze-javascript-application.json.gz`).
Four complete compiled declarations with byte/codepoint ranges and SHA-256 values
are in `.ara-state/composer-next-ee120e2/source-binding.json` (source-only,
historical; this directory is not tracked product source).

## Change

- `src/features/chat/useSuggestionPointer.ts` — new private hook matching the
  Conductor pattern.
- `src/features/chat/SlashMenu.tsx` — `onMouseMove` → `onMouseEnter` with the
  pointer-ready guard.
- `src/features/chat/FileMentionMenu.tsx` — same change.

## Verification

- 20 self-contained test cases in `composerSuggestionPointer.test.ts` (Node
  `--test`, TypeScript-transpiled vm pattern matching the repository standard).
- Baseline partition: 6 predicted failures (initial entry and within-row
  movement before readiness, re-enable reset) × 2 menus; 14 passing controls.
  Candidate partition: all 20 pass.
- Not run: browser layout, native macOS pointer event ordering. Those remain
  unverified.

## Limits

Synthetic test dispatches document events through an isolated `EventTarget`, not
real browser mouse events. No layout-dependent hit testing or native propagation
order is proven. Browser and native visual verification remain separate required
gaps.
