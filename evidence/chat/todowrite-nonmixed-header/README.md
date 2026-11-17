# Nonmixed TodoWrite headers — BE7

Candidate: `TODO-WRITE-NONMIXED-HEADER-BE7`.

## Change and source qualification

Normal `TodoWrite.input.todos` reached the shared todo renderer, but only nonempty TodoRead inputs used the state-derived label and active-item/count summary. TodoWrite therefore displayed the generic “Update todos” / completion-ratio header for nonmixed states.

The production delta is four lines in `ToolRows.tsx`: share the existing state-header mechanics with nonmixed TodoWrite, including an empty-list guard. Mixed TodoWrite, TodoRead, bodies, disclosure, styles, provider adapters and native behavior are unchanged.

`source.json` contains the retained Conductor 0.87.6 source qualification: two original asset identities, 23 full spans, 32 reference joins, eight fresh-main file identities and 11 current integration joins. The ordinary route is schema → na/Fa/uie export/import → ROo → cTr/lTr → hIt/D1o/Qpo → G0o → Mu. This establishes the normal input route, not merely a matching string.

The original renderer REA analysis exhausted its heap. Exact retained raw spans were statically verified; the original renderer was not executed. Retained REA receipt: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

Qualification used main `217498aae38dfd63b97919b1a0ab4097462c691e`. Delivery was replayed after merging main `2ada6e3e1`; `integration.json` proves all eight relevant main files still have the qualified identities. The exact production-delta verifier also passed on the delivery tree.

## Frozen regression and approved expectation integration

- The unchanged new 20-case regression failed before the fix: 8 passed / 12 intended failures, with no harness failures (`red.tap.gz`).
- Adjacent baseline: 133/133 passed. Baseline TypeScript passed after an earlier 90-second timeout.
- First treatment: 150/153 passed; the three failures were legacy assertions requiring the old TodoWrite header (`first-treatment-conflicts.tap.gz`).
- Original bytes for all three affected legacy files are archived in `baseline/`.
- Only the “only active” ordinary-row expectation, `control-write-active` expected header, `control-write-all-completed` expected header and corresponding fixture-integrity digest changed. Case IDs, inputs, assertion counts, TodoRead expectations and mixed controls were retained.
- `verify.mjs` checks those exact legacy transformations, original asset spans/joins, frozen new files and the exact production delta. It passed with both original assets supplied. `verify-integrated.json.gz` retains the result.

Frozen new file SHA-256 values:

- `todoWriteHeader.test.ts`: `f807024a4b397b059f7e98525469a0d5a76d06d114838cb367c7c0d3344992dc`
- `todoWriteHeader.inputs.json`: `8baed89bb331a64fa96f6de8019c7116d55c0e1b7c8d31efd16dc2090d95f901`

## Completed delivery checks

On a Reason cloud computer, integrated tree `757fc23f2`:

```bash
OC_RETAINED_RENDERER=/path/to/original/renderApp-D_fmY7hW.js \
OC_RETAINED_INDEX=/path/to/original/index-BGEQ8YjU.js \
node evidence/chat/todowrite-nonmixed-header/verify.mjs

node --experimental-strip-types --test --test-concurrency=1 \
  src/features/chat/{todoWriteHeader,todoMixedRows,todoReadResult,todoReadHeader,todoReadEmptyBody,conductorTools,reason,reducer,view}.test.ts

npm run build
```

- Source/frozen/semantic verifier: **passed** (both original parent assets verified).
- New frozen regression: **20/20 passed**.
- Integrated focused suite: **153/153 passed**, zero failed/cancelled/skipped (`green-fresh-main.tap.gz`).
- Default production build: **passed**, including branding, TypeScript and complete Vite output (`build-integrated.log.gz`; Vite 71 seconds). Existing large-chunk warnings remained warnings. The earlier 300-second build timeout is retained separately and is not counted as a pass.
- `git diff origin/main --check`: **passed** before publication. Raw TAP diagnostics contain whitespace emitted by Node, so affected raw logs are gzip archives with original-byte round-trip verification rather than edited logs.

## Incomplete / not exercised

The all-chat command below timed out at 300 seconds after 1,639 passing assertions and no reported failure. It did not emit a final summary and is **not a completed full-suite pass** (`full-chat-300s-incomplete.tap.gz`). An earlier attempt stopped after 1,084 passing assertions. A serial 21-file tail beginning with `turnFilePreview.test.ts` also timed out at 180 seconds after 229 passing assertions and no reported failure (`chat-tail-180s-incomplete.tap.gz`). These runs overlap and their counts must not be added.

```bash
node --experimental-strip-types --test --test-concurrency=1 src/features/chat/*.test.ts
```

No browser/native screenshot, packaged-app run, real provider session or side-by-side native acceptance was performed. This lane has source/test-only runtime admission; existing exclusive runtime/native/package owners retain those checks. Static reference qualification and mounted test harnesses do not prove native appearance or packaged behavior. No runtime, native, package, cloud UI, watcher, delegate or real-user data mutation was dispatched. The sole heavy build/typecheck slot was explicitly released to the ledger after the default build passed.
