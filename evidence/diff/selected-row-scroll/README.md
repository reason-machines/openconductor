# Scroll the active Changes row

Conductor Rebuild, 2026-11-11. Unit `DIFF-SELECTED-ROW-SCROLL-01`.

## Change and source boundary

The Changes tree already reveals the active file's ancestors (#1022), but its rendered file row never receives a scroll request. This change keeps a ref for each mounted row, remembers a pending active selection, and calls `scrollIntoView({ block: "nearest" })` once that selection has a rendered row. A hidden selection waits for its row; another selection, leaving file content, or a workspace change replaces or clears the pending request. Ordinary renders and manually collapsing a folder do not repeat a completed request.

RightPanel forwards the existing active-file path only after Changes presentation has hydrated. The presentation store initially exposes flat, unfiltered defaults before asynchronously loading saved filtering and collapsed paths. Forwarding a selection before that load completes can consume its request against provisional rows. The store now exposes a read-only `isReady` snapshot derived from its existing phase; the hook subscribes with `useSyncExternalStore`. No new state flag, persistence schema, write, delay, polling, dependency, or retry is added.

The product scope is four paths: `ChangesList.tsx`, `changesPresentation.ts`, `useChangesPresentation.ts`, and only the presentation subscription/ChangesList caller hunks in `WorkspaceView.tsx`. Other WorkspaceView clear/chat hunks, existing tests, DiffViewer, file-tree helpers, CSS, providers and cloud UI are untouched.

## Retained shipped reference

These are static observations of decoded/minified shipped JavaScript, not original source or observed native behavior. The retained Conductor renderer is `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The existing REA receipt is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Its earlier semantic analysis exhausted the heap; bounded literal reads supplement it rather than claiming full semantic coverage. No new reference analysis failure, acquisition, evaluation, browser or native operation occurred in this unit.

The complete retained `bys` component and `sys` helper establish the active-path → visible-row index → pending selection → list-ref scroll consumer chain. Exact UTF-8 half-open spans and hashes are retained in [reference-spans.json](reference-spans.json). The list consumer uses a virtualized index-based API. OpenConductor's DOM `block: "nearest"` is an adaptation, not proof of equivalent layout or scroll geometry. The presentation hydration correction follows OpenConductor's own store contract, not an inferred Conductor hydration contract.

## Actual regression history

The complete fixture is preserved at SHA-256 `7043501cfea2ce48d956ea4728abfd531a93058327b243e2291a014297cd3a9f`. Its seven names, bodies and assertions are unchanged between the qualified baseline, failed first product candidate and passing V3 candidate.

1. The [original baseline stop](receipts/original-baseline-stop.json) had four intended assertion failures, two CommonJS default-import adapter errors and one inactive control pass. It did not qualify six behavioral failures; no product candidate ran.
2. Adapter V2 changed only the fixture transpiler's `esModuleInterop: true`, matching the production interop contract. The [qualified baseline](receipts/v2-red-and-candidate-failure.json) produced six intended scroll assertions and one inactive control pass, without a setup error. The first product candidate passed five and failed two. Both failed the initial no-scroll assertion while a saved query was hydrating, before later query-clear/cancellation steps.
3. V3 added only the readiness gate described above. Its entire ChangesList implementation is byte-identical to V2. All 17 production baseline inputs and the complete seven-case fixture were byte-identical to the already-executed V2 baseline, so that baseline was reused rather than replayed. The [actual V3 terminal receipt](receipts/v3-seven-pass.json) records seven passes, zero failures, zero skips/cancellations and exit 0.

The sole serialized executor ran:

```bash
node --test --test-concurrency=1 src/features/diff/selectedRowScroll.test.ts
```

The qualified baseline decisive result was six `ERR_ASSERTION` failures plus one control pass. V3's decisive TAP was:

```text
1..7
# tests 7
# suites 0
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

V3 ran once from 11:03:02.178681Z through 11:03:03.782731Z with a 384 MiB Node heap, nice 19, 60-second timeout plus 5-second kill grace, 70-second outer limit, and 16 MiB growth cap. It finished in 1.604 seconds with 2,046 bytes of growth and no limit condition. No dependency installation/export, assertion change, retry, duplicate baseline, broad local suite, TSC, build, lint, browser, provider, native or reference execution was performed.

The fixture mounts the actual RightPanel and its workspace caller, presentation hook/store, tree/filter and ChangesList. Dormant external boundaries are stubbed. React DOM-node mocks record scroll requests: they do not implement layout. The cases cover active diff selection after ancestor reveal, one-shot/manual re-collapse, hidden filtered selections and replacement, workspace identity, current-workspace file targets, leaving-file cancellation, and inactive/absent controls.

## Delivery checks and limits

Before applying the frozen patch, fetched main `5555ec597fa5d3af0311ae0094eb3134d87fbb08` matched all 17 baseline inputs. The exact four-path patch applied cleanly to the assigned branch after merging main. Product file hashes equal the passing executor candidates, and the entire delivered fixture equals the executed fixture; see [delivery-source.json](delivery-source.json). `git diff --check` passed. The original stop, V2 failure and V3 terminal receipt are retained as exact original bytes.

Ordinary hosted CI must validate the published head, including the broader Diff suite, typecheck/build and other repository checks. No local broad checks were run because the serialized runtime reservation covered only the focused component fixture.

No screenshot is available: this unit has no browser or native admission. Installed-app behavior, real scroll geometry, keyboard behavior, native/provider execution, reference-JavaScript execution and side-by-side visual acceptance remain unverified. Green tests and a consuming package do not close those acceptance gaps.
