# Alacritty from a primary diff-header path

Conductor Rebuild owns `SAME15-ALACRITTY-DIFF-PRIMARY-INVOCATION-V1`. The ledger cleared the primary `FilePathChip` invocation and its new caller regression. The workspace-header file-aware hypothesis and empty-catalog inquiry remain closed. Existing Alacritty, WezTerm, and Kaleidoscope launcher fixtures are unchanged.

## Source comparison

The baseline is main `9524569976a69a3151be1f2a3cac17bfac935312`. With a loaded local workspace `/tmp/open-in-workspace`, contained file `src/example.ts`, and installed Alacritty selected as the saved default:

- Retained Conductor `NPo` passes `fileIsPrimary=true` to `tee`. Its primary click handler calls `uD` with the absolute file, workspace boundary, and workspace directory fallback. For a contained file, `uD` selects that workspace directory. Alacritty requests IPC `msg create-window --working-directory`, then activation on completed success or the new-instance fallback on completed nonzero.
- Baseline `FileDiffView` passes the same worktree to `FilePathChip`. The chip sends only the absolute file through `openInApp`. `commands::open_in_app` classifies it as a file and bypasses the existing typed Alacritty folder route. The generic terminal file opener uses the file's parent folder instead.

The proposed correction changes only the Alacritty primary-chip target to the available worktree. It reuses the existing folder entrypoint without changing backend commands, status handling, PATH, other apps, context-menu filtering, or workspace-header behavior.

## Retained reference identity

The real-app renderer is Conductor 0.87.6, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, retained from `/Applications/Conductor.app` on Sven's Mac. Existing REA bounded-slice evidence is `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`.

[The source pins](source-v1/source-pins.json) retain 18 original spans and six baseline source snapshots. Every span was compared with its exact byte range in the hash-verified renderer. Caller and helper joins are manual inert-source checks, not a fresh acquisition or automatic call-graph proof. The unresolved `QZ` UI alias does not establish visual parity; the complete `tee` click handler and `NPo` caller are retained.

## Frozen caller regression

`src/features/diff/filePathChipAlacritty.test.ts` mounts the real `FileDiffView`, real `FilePathChip`, and real `openInApp`. The test replaces catalog/preferences and the Tauri process boundary, not the click handler. Empty hunks avoid invoking Pierre's unrelated editor. A recording `invoke` observes the requested app and path.

The seven cases cover nested, space-containing, and root-level Alacritty files; Finder and VS Code file-payload controls; a missing worktree; and launch-error notification. The first three are predicted baseline failures, not observed RED yet. All seven inputs and assertions are frozen by SHA-256 `97c62299ab7cae93bfe17379e56254c01a977cf5d66b06f93e9e38bd761783e2`.

Automatic PR CI runs `node --test "src/**/*.test.ts"` and `npm run typecheck`. The focused equivalent is `node --test src/features/diff/filePathChipAlacritty.test.ts`. No local Node or Rust execution is authorized in this lane. Product code remains unchanged until hosted behavioral RED is observed. Setup, compilation, and dependency failures do not count as RED.

## Verification status

- Passed on Reason cloud: `python3 evidence/open-in/alacritty-diff-primary/verify_source.py`. All 24 file identities, 13 source joins, and the frozen regression digest matched.
- Passed: `git diff --check`.
- Not run yet: baseline caller regression, candidate regression, compilation, ready-head checks, merge, and consuming-main package verification.
- Not run: native GUI, real Alacritty launch, actual cwd, window activation, provider acceptance, screenshot comparison, or full checkpoint restoration. The regression records IPC; it does not prove these effects.

No browser screenshot is supplied because the visible layout is unchanged and native execution remains with its existing sole executor. Laziness Protocol keeps the proposed fix in the caller. Prove It Works keeps source qualification separate from pending behavioral checks.
