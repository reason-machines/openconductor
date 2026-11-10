# Turn-file footer previews

Conductor Rebuild owns `CHAT-TURN-FILE-PREVIEW-BE7-03`, a distinct successor to merged #900 and #907. The five-path lease covers only the footer chip construction, its local preview module/styles/tests, and this receipt. No shared ToolRows, diff API/backend, composer, pairing, loadout, or E2E harness changes are included. #847 remains untouched.

## Current source and boundary

The builder fetched main `3d48b5287e9040733b8802f66b10e4a021279487` and integrated it on the existing assigned branch before writing. The net tree was identical to that main. During continuation, main `314aef7f20d0bacc08450b38d2af409048e9c0e5` was fetched and integrated; the footer, shared badge, diff API and diff types remained byte-identical. Its `TurnChanges.tsx` is unchanged from the parent's audited main `d7d316031d97acaff81ebd08ad0884a70c4e57e0`: Git blob `7fb6bb6d05a4eebc7adb195825a14bf15ae8d3d2`, SHA-256 `7504c971e7550ada4eabb46b6b91231a177382ac94fcd8a5b4b5625c24e18b5a`. It constructs generic `FileBadge` controls with a path title and click callback, but no preview or diff request. `diff/api.ts` SHA-256 is `abbc4950ec46258c7cd76c447ce63f5a923b80a9d9313e6c13c2e4a6d02e5c7a`; `loadWorkspaceDiff` already accepts `extra.path` and `extra.turn`, mapping the latter to the historical start/end checkpoint scope. A footer preview does not need another backend API.

## Retained reference evidence

The parent independently rehashed retained Conductor 0.87.6 assets against the manifest before handing over this slice. The complete bundles are not retained in this recovered builder checkout, so these identities and excerpts are attributed to that handoff, not an independent builder rehash:

- `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

All ranges below are half-open UTF-8 byte offsets. They are source observations, never executed reference code:

- Renderer config `[8912546,8912560)` SHA-256 `4c41478a9d8b26ac348a68185b5b879373a16965987b918ab10dd2a55bdb8290` sets the changed-line preview threshold to 500.
- `_Do [8914498,8915567)` SHA-256 `4a89d06117a7ab5865d0de334d29f93edd4986786a929a8a00f2ff75d0d54e0e` uses the tooltip “Open to view preview” without hover contents above 500 added-plus-removed lines; otherwise supplies `bDo`.
- `bDo [8912726,8914498)` SHA-256 `c3b6c6edfeb89702256f1116e290a908b095925a640ffd44bb41d21769fa4161` constructs a turn view with session/turn IDs and invokes `Gri` for the selected file, status, binary flag, old path, and workspace. It renders loading, missing diff, size-hidden, or binary states. Available old/new text reaches an inline diff with workspace-relative path header.
- `vDo [8915567,8918132)` SHA-256 `08c10b3ca097beb20440782b02ca7a9708209334e6dd30cbbf10324a1f100d0e` preserves the chip's turn-scoped changes/diff click action.
- `tee [7777001,7782029)` SHA-256 `38d4a2efa99fd08a87b2540dfb48add94860e8932a56c644132fcecf20165bf0` sets open delay 150ms, close delay 100ms, top/start alignment with 8px offset, width 28rem limited to viewport minus 2rem, and interactive contents.
- `p9e [6127202,6130285)` SHA-256 `61f02d561b5c025452cab07849125e8d40fd82556986d58b5a2b8fd8587e3cea` cancels trigger-focus opening, cancels pending close on content entry, and arms close on departure.
- `sV [7775444,7776600)` SHA-256 `8b38333809c09e26d0d90ecf0ae88eae19cf9694747952170a37cea38edbf1e6` uses a 20rem default maximum height, Pierre inline diffs and inert fallback text.
- Renderer import `[61256,61266)` SHA-256 `36566bfba891d792e120829cfcc320787d5f0ae5a10dd2887e78d537ff62a69b` maps `mt` to `Gri`. Index export `[3488159,3488169)` SHA-256 `577c0f0b786a82c8e52cccdaf0c7cae88410d791ce4518f6b710953a9f82ed40` maps `Y9t` to `mt`.
- Index `Y9t [3199214,3200829)` SHA-256 `d275afb03c1b74e04d37c8a6f46e9edfcf82d43d4b889bbf6cf013c1eb73f740` (UTF-16 `[3198714,3200329)`) reads the selected turn's start/end checkpoints and selected file, and passes them with workspace/view parameters to the diff controller. This establishes historical turn scope, not current-worktree preview semantics.

The parent's [canonical source audit](https://reasonmachines.com/agents/be7a40e4-7a95-4b4b-a75d-41eaf9426f8b?page=0d3c40a0-94ad-46c2-9ecb-f83e4675d616) retains the source chain. REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` skipped the renderer after heap exhaustion; this renderer trace is the manual decoded-byte fallback, not semantic nodes, full renderer analysis, or native observation. No acquisition, reference execution or new REA run occurs here.

## Local shape and limits

Two local shapes were considered: reuse the full diff-tab file view, or keep the footer chip's preview state private and render read-only inline rows. The latter avoids importing diff-tab mutation/header/keybinding behavior into a small hover card. The caller is one footer-local component receiving the file, worktree, turn and existing click action. The module owns pointer timing, selected-request lifecycle and read-only rows; the footer keeps counts, ordering, compact/reveal groups and navigation unchanged. It reuses the public file glyph and basename helpers, preserving the badge's button markup and click propagation behavior. The portal adds no flex-layout wrapper. The chip key contains the worktree, session, turn and file identity, so target replacement unmounts the previous request owner. Shared generic badges and backend APIs remain unmodified.

Requests start only once a preview actually opens. A changed file's 500/501 boundary is checked before fetch. Requests use the existing unified diff API with whitespace changes visible and explicit path/turn scope. Closing, unmounting, or replacing the turn/worktree/file invalidates old results. Read-only React text, not HTML, carries untrusted diff contents. This is an adapter over existing hunk data, not a new arbitrary-file reader. It does not claim full Pierre syntax/highlighting parity.

The backend `FileDiff` contract has no reference-style `hideReason` or archive-size signal. The change must not invent that response field or pretend to distinguish backend size-hidden errors. The known changed-line threshold is implemented separately; missing/error results map to “No diff available,” and available binary results to “Binary file changed.” Native and retained-renderer visual acceptance remain **NOT RUN**.

## Regression-first sequence

The first publication adds only this receipt and `turnFilePreview.test.ts`; production code is unchanged. The tests mount actual production `TurnChanges` with React's test renderer, real footer layout, file badge/glyph/count implementations and hooks. Only the turn-file list and asynchronous diff I/O are controlled boundaries. The portal is projected into the test renderer and geometry/timers are deterministic; this does not test a real DOM, browser placement, native pointer delivery or provider behavior.

The 15 cases exercise delayed and lazy historical requests at 500 lines; no fetch and click preservation at 501; short-hover cancellation and interactive close grace; binary/empty/error states; rejection of a nonselected response; stale turn/session/worktree/path results; close/unmount invalidation; glyph/count/order/reveal layout; and no-files/ordinary-click controls.

The original hosted RED at regression head `7141efe8b3038d8d1aeb67cf11a6471c873cc3d9` is [CI run 42853067491, frontend job 129958673193](https://github.com/reason-machines/openconductor/actions/runs/42853067491/job/129958673193). It ran 1,799 tests: 1,786 passed and 13 failed. Twelve were the intended preview cases (558–569): the old footer never requested a preview, and the 501-line chip retained its path title. Basic no-files and ordinary-click controls (571–572) passed. The thirteenth failure (570) was a fixture mistake, **not a product defect**: the seven-file layout control selected the more button by `Show 5 more changed files`, but production `chipLayout` correctly describes the next three-file batch with `Show 3 more changed files`.

The parent explicitly released the byte invariant for that selector literal only. The separate fixture-only publication `b6fe386fff170012bccd4e80615e210b311353ff` changes `Show 5 more changed files` → `Show 3 more changed files`; every case and behavioral assertion remains present. Original test blob `3a2780c20fb235d57f8abccf68406dc425075239`, SHA-256 `c259cfccd589450986ce40f5f16bb8868d56e0cb638d359c4702d8c41a47b0e2`; corrected blob `ba10e125a26b89abf737c8beaa9bf5b7b49fb196`, SHA-256 `52aa4f99c52665d40b060c987b6728ac9c6595200139acc16cfa400e70cefc11`. No production more-button or cache behavior changes. The corrected test bytes will remain unchanged through the preview fix.

- `git diff --check`: **PASSED** before first publication (including a staged check after adding the new files). The regression test blob is `3a2780c20fb235d57f8abccf68406dc425075239`, SHA-256 `c259cfccd589450986ce40f5f16bb8868d56e0cb638d359c4702d8c41a47b0e2`.
- Hosted automatic `node --test "src/**/*.test.ts"`: original **RED CONFIRMED** as described above. The separate fixture-only head `b6fe386fff170012bccd4e80615e210b311353ff` subsequently produced a clean **RED CONFIRMED** in [run 42854322771, job 129963072772](https://github.com/reason-machines/openconductor/actions/runs/42854322771/job/129963072772): 1,799 tests, 1,787 passed, exactly 12 intended preview failures (558–569), and all three controls (570–572) passed. These are the same corrected test bytes used by the production fix. Corrected-production GREEN is not yet observed.
- Hosted typecheck and colour lint at regression head: **PASSED** in job `129958672942`; its frontend tests failed and later build steps did not run. All exact-head checks on the final production head remain **PENDING**.
- Local tests, builds, dependency installation, app/browser/native/runtime execution, acquisition, probes, cleanup, manual dispatch and reruns: **NOT RUN**, excluded by this slice's execution gates.
- Screenshots/recordings: **NOT AVAILABLE**, since app/browser/native execution is not authorized here. Mounted React callback coverage is not mounted-app or native parity evidence.

## CI event attribution after production publication

The 16:27 UTC failure notification refers to original regression head `7141efe8b3038d8d1aeb67cf11a6471c873cc3d9`, not production-fix head `1489b2cf86f1a9d233f4e96bb649261e3e3cff6e`. CI run `42853067491` failed in both frontend jobs at the intentional failing test step; typecheck itself passed and the later build did not run. E2E run `42853067464` has that same original head: its Codex job passed and Reason job was cancelled. A cancellation is not a behavioral failure or pass.

The builder fetched the published branch and verified the production source tree exactly matches the local tree `68fa2bdc3516df9b864ceb23e54475265669d958`. Corrected test blob `ba10e125a26b89abf737c8beaa9bf5b7b49fb196` and SHA-256 `52aa4f99c52665d40b060c987b6728ac9c6595200139acc16cfa400e70cefc11` remain unchanged. No production correction, test weakening or manual rerun is justified by that stale notification. At the attribution check, only CodeQL had appeared on the production head; ordinary CI GREEN remains unverified. This receipt update changes no production or test bytes.

## Automatic workflow recovery and typed callback correction

At the bounded continuation read, GitHub reported `d3c6c958b78637e7193ee29be5dc6010fbe41950` mergeable with no conflict or pending mergeability calculation. The generated merge ref existed at `a34fed89883cf410ba1e4db67b7960dcdd0e225a`. Fresh main was `314aef7f20d0bacc08450b38d2af409048e9c0e5`, already integrated, so no main integration was needed. CI, Keybindings and E2E subscribe to unfiltered `pull_request`; Chat and workspace-tests also produced automatic current-head runs. The ordinary runs appeared at 16:35:56–57 UTC without a new commit, dispatch, rerun, workflow edit or permission change. The earlier delay's cause is not established; missing scheduling is no longer the active blocker.

On that exact head, [frontend unit job 129969509409](https://github.com/reason-machines/openconductor/actions/runs/42856126736/job/129969509409) **PASSED** all 1,799 tests, including all 15 footer cases (558–572); the separate onboarding step passed 18/18. This is hosted callback-level GREEN on unchanged corrected test blob `ba10e125a26b89abf737c8beaa9bf5b7b49fb196`, not rendered/native acceptance.

[Frontend typecheck job 129969508779](https://github.com/reason-machines/openconductor/actions/runs/42856126736/job/129969508779), [Keybindings job 129969508799](https://github.com/reason-machines/openconductor/actions/runs/42856127092/job/129969508799) and [macOS Tauri job 129969509228](https://github.com/reason-machines/openconductor/actions/runs/42856126736/job/129969509228) **FAILED** on TS7006 in `turnFilePreview.ts` lines 131–132. Both button callbacks lacked explicit React event types in the `createElement` props object. Keybindings' registry/unit steps passed; its build failed before shortcut E2E. This is this change's compile defect, not the earlier composer baseline.

The correction adds only React `MouseEvent<HTMLButtonElement>` and `PointerEvent<HTMLButtonElement>` annotations and type imports. It changes no callback behavior, tests, shared code or workflows. Source/test identity, five-path scope and whitespace checks run locally; corrected-head typecheck/build and all automatic checks remain **PENDING** until hosted results arrive. All local test/build/runtime/native exclusions remain in force.

Conductor Rebuild retains delivery through exact-head green, protected main merge and automatic exact-main consumer/package verification. Existing unrelated baseline failures remain with their owners; no failing check will be bypassed.
