# Whole-file context survives a rejected refresh

Conductor Rebuild reproduced the failure on main `74e48d1354ff54e3ef252558d41f2edf242a2248`.

## Reachable failure

The regression mounts the actual `useWorkspaceDiff`, `DiffTab`, `useWholeFile`, `loadWorkspaceDiff`, and `useFileEdit`. It defers the external `diff_workspace` IPC and substitutes a props probe for the DOM-dependent `FileDiffView`. The local loading and editing hooks are not copied or mocked. The existing production poll is advanced with a controlled timer.

Three cases reproduce lost context:

- The loaded selected file gets a new modification timestamp and patch. During its whole-file refresh the view receives `full: null` instead of the previously loaded complete file.
- That refresh rejects. The view continues to receive `full: null`.
- Only another changed file changes. The selected file keeps the same logical identity, timestamp and patch, but the real list loader replaces its object. Its rejected whole-file refresh also drops the previous complete file.

The last case rules out a legitimate selected-file revision change. A completely unchanged list is a passing control: the list loader reuses its previous objects and does not issue another whole-file request.

The key-change controls pass a new view context directly to the mounted `DiffTab` to check the hook in isolation. Those checks must not be presented as independently reproduced navigation defects. They verify that retention cannot carry contents between worktrees, target branches, target remotes, scopes, commits, turns, whitespace modes, rename origins, or file statuses.

## Retained reference source

The reference is Conductor 0.87.6, retained through the existing REA acquisition. No reference JavaScript is executed.

Original upload `conductor-dxe-source-closure.tar`, attachment `078ccf87-1bdc-43a9-b085-ea94babc5839`, is 21,493,760 bytes with SHA-256 `f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084`.

Both complete retained assets were reverified against that archive:

- `index-BGEQ8YjU.js`: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `renderApp-D_fmY7hW.js`: 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The decisive index ranges use zero-based UTF-8 bytes with half-open ends:

- `uLt/q2/vd/rv`, `[3168647,3169827)`, SHA-256 `951bd310622197d6c18701858e722c65564ed6fda7a51c4ab04be4ec8e4fd8aa`. `vd` is the logical-file identity; `rv` additionally includes `lastModifiedTime`.
- `vLt`, `[3172383,3177216)`, SHA-256 `a57aa542796bd483596be41eff24da40dfc2fe28a8537d3a4c32e05b0d7bf110`. Its `I` helper carries prior non-FetchError loaded data when the freshness key changes but the identity remains. `A` keeps prior loaded data on a thrown refresh. `k` also keeps prior loaded data when a refresh returns FetchError. Both result setters reject superseded identity mappings.

The retained `verify-scheduling.py` checks the original archive, 32 outer and 11 inner safe members, both originals, seven exact spans, and twelve static joins. Seven corrupted span controls and one corrupted original control must be rejected. Its current-main comparison is pinned to historical `a588bddd7f56be4493644dae4c41952919e56f6a`; the regression in this change uses the fresh main SHA above instead. The current `DiffViewer.tsx` at that fresh SHA has the same SHA-256 `47847937815b033611e073c47845411dc5cceebd16dcd94cfec602e7ca195108` as the previously inspected file.

The original REA renderer semantic-analysis heap exhaustion is retained as gap `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The exact-byte verifier is not claimed to replace runtime or visual observation.

## Focused correction

Separate the logical identity from the latest selected object. Keep the last successful same-key whole file during a new request and after its rejection. Different keys must expose no previous full contents, and the existing effect cleanup must ignore superseded results.

Retained context is display-only. The editor receives complete contents only after the current selected object has a successful whole-file load. A transient failure must not make old contents writable. A successful later poll replaces the retained context and restores editing.

## Verification

The failing regression was committed first as local `c7f51eb3fc14301482dbed16e137f71c5a2840b4`, before any production edit. Typecheck then required an export type-narrowing assertion in its loader. The final test additionally supports a pinned OpenConductor source selector, so the same bytes were rerun against the original main hook and the fix. No behavioral assertion was removed or weakened.

The final regression SHA-256 is `2cd8c97d2b881249e31e2a2d5ac35b9093d257a071d05233a069f20506cd1f9c`. With `DIFF_VIEWER_REGRESSION_REF=74e48d1354ff54e3ef252558d41f2edf242a2248`, it produced six intended assertion failures and eleven passing controls. Against the fix, all seventeen passed. Both runs had zero cancellations and skips. Three failures are the actual polling retention cases; three are mounted-hook identity-isolation controls for branch, remote and whitespace.

The first full Diff run passed 341 of 347 cases. Six existing auto-close tests used a partial `WorkspaceDiff` fixture without its required `target` field. The fixture now includes `target: { branch: "main", remote: "origin" }`. No existing assertion changes and no undefined-target production fallback is added. After the fixture correction, the full Diff suite passed all 347 tests with zero failures, cancellations or skips. `npm run typecheck` and `git diff --check` passed. The final test hash above is unchanged.

```bash
DIFF_VIEWER_REGRESSION_REF=74e48d1354ff54e3ef252558d41f2edf242a2248 node --experimental-strip-types --test src/features/diff/wholeFileRefresh.test.ts
node --experimental-strip-types --test src/features/diff/wholeFileRefresh.test.ts
node --experimental-strip-types --test --test-concurrency=1 src/features/diff/*.test.ts
npm run typecheck
git diff --check
```

## Limits

This is mounted React component/hook verification with controlled external IPC, not a browser screenshot, installed app, native launch, visual parity, provider action, or real Git failure. No screenshot is provided because browser/native execution is excluded from this unit. The reference source establishes store retention semantics, not rendered error messaging. No new error presentation, cache persistence, generic scheduling behavior, or parity claim is added. Consuming-main CI and macOS package results are separate post-merge checks.
