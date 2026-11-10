# Local header branch interactions

Conductor Rebuild reconciled this narrow interaction against main `aa65f35047db1217862943426d77bc44d142626f`. This is not a header layout redesign, workspace-directory rename, or another custom-section acceptance pass.

## Shipped reference and bounded failure

The retained real Conductor 0.87.6 frontend comes from the installed app's REA extraction, documented in [frontend provenance](../frontend/README.md). [The focused inert-text trace](reference-static.json) records the original REA evidence ID, both artifact hashes, UTF-16 and UTF-8 offsets, and exact excerpts. Regenerate it without executing target JavaScript:

```bash
node tools/side-by-side/trace-header-branch.mjs .rea-work/dist/assets
```

The script checks the two decoded artifact hashes against the retained REA graph. `renderApp-D_fmY7hW.js` has SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

- `ACi` invokes `bro` for a non-archived local workspace.
- `bro` at UTF-16 offset 7,163,058 opens an inline input from the branch label. Enter and blur submit; Escape cancels. A context menu offers Copy (`C`) and Rename (`R`). Copy uses the full branch, not a display label. An absent or detached branch cannot be renamed.
- The renderer's import aliases matter: `QO` imports index export `aP`, which resolves to `cs`; `ZTn` imports `h8`, resolving to `pOe`; `yDt` imports `h7`, resolving to `aVt`. Same-spelled index functions are not those imports. `pOe` replaces runs outside ASCII letters, digits, hyphen, underscore, dot and slash with a hyphen. `aVt` owns the user-initiated branch mutation and its error handling.
- On the comparison main, `WorkspaceView.tsx` lines 1241–1243 instead render a noninteractive branch chip. There is no click-to-edit or branch Copy/Rename context menu in that hunk. Existing workspace Rename is a different operation: it changes the directory/name and can optionally change the branch.

This establishes a missing source interaction, not a native runtime reproduction. The existing repository breadcrumb menu, local-only badge correction, Home routing, sidebar grouping and #799 persistence changes are preserved.

## Ownership and implementation boundary

Ledger owner `ddfc6518` reserved the branch-label interaction to this lane. The adjacent `WorkspaceView` center-tab work belongs to `1f14fa82`; only the branch chip and one import are integrated here. The existing `rename_workspace_branch` backend remains authoritative for Git validation and mutation. No new backend command or workspace-name mutation is needed.

`WorkspaceBranchHeader` replaces the inert chip with the same full-branch chip presentation, an inline input and the existing context-menu primitives. Its shared controller runs the existing rename command, dispatches the changed branch without changing the directory/name, then persists the user-set marker. If the marker fails after Git succeeds, the UI keeps the actual changed branch and reports that partial success explicitly. Repeated Enter/blur submissions are excluded while pending. Missing branches disable Copy; missing/detached branches disable Rename.

Type System Discipline shaped the choice to reuse the typed workspace and existing rename action rather than threading a second workspace model through the header. The header's existing full-branch presentation and chip layout stay unchanged; matching Conductor's prefix-stripped label and whole-header layout is outside this interaction fix.

## Source checks

- `node --experimental-strip-types --test src/components/workspaceBranchHeader.test.ts src/state/workspaceRename.test.ts src/components/sidebarLabel.test.ts`: passed 23/23, including ten new controller cases. The builder's initial test failed because the controller module did not exist; that is test-first evidence, not a real-app failure reproduction.
- A reference-backed empty-branch Copy assertion failed in the assembled implementation (`actual [["copy", ""]]`, expected `[]`). Adding the missing controller guard and disabled menu state made the same focused suite pass. [Failing result](copy-red.tap) and [passing result](focused-green.tap) are retained.
- `npm run lint:colors`: passed all six checker tests and the source scan.
- `node --check tests/e2e/shell-context-menus.e2e.mjs`: passed. The appended browser regression covers click-to-edit, Enter, blur, Escape, context-menu Copy/Rename and unchanged workspace title. It was prepared for the existing CI suite but not executed locally.
- Reference regeneration passed artifact/alias checks and byte-matched the committed JSON; `git diff --check` passed.
- `npm run typecheck`: failed only because this checkout's existing dependency directory lacks `mermaid` and `dompurify`; [exact output](typecheck.txt) is retained. No dependencies were installed and no type-check suppression or declaration stub was added. A clean CI install is required for the full-project verdict.

## Case-insensitive build correction

The first published head `a19adaed` failed the macOS build because TypeScript resolved `./WorkspaceBranchHeader` to the lower-case controller `workspaceBranchHeader.ts` before the TSX component on a case-insensitive filesystem. CI reported TS1149/TS1261, a missing component export, and the resulting untyped callback. Renaming the controller to `branchHeaderController.ts` and updating its two imports removes the ambiguity without changing behavior.

A local TypeScript `resolveModuleName` check with a case-insensitive `fileExists` host selected `WorkspaceBranchHeader.ts` before the rename and the correct `WorkspaceBranchHeader.tsx` afterward. The same 23 focused tests and whitespace checks passed after the rename. Local full typecheck still reports only the two missing dependency modules recorded above; the macOS workflow must verify the actual platform build.

## Verification limits and acceptance

No browser, native app, preview server, full build or workflow dispatch was started in this source-only lane. No screenshot is available because browser/native admission belongs to the existing serialized owners. Source and handler checks cannot verify native focus, clipboard permissions, real Git mutation, or pixel parity.

The eventual disposable-profile acceptance inputs are: a ready local workspace on `demo/current`, a different available name `demo/renamed`, a second workspace to verify identity isolation, a detached-HEAD case, and a taken branch to exercise backend rejection. Check click-to-edit, Enter then blur (one mutation), blur-only submit, Escape without mutation, unchanged/empty input, full-branch copy through the menu, detached rename disabled, error notification, and unchanged directory/workspace identity. This checklist does not authorize or launch a runtime.

## REA gaps

No new REA analysis or capture was attempted, and no new REA failure occurred. The retained extraction and graph supply bounded static provenance. Earlier REA semantic-graph resource limits remain recorded in the existing area evidence; inert text does not establish execution or successful native backend I/O.
