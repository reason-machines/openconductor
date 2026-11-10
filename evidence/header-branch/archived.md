# Archived local branch headers are read-only

Conductor Rebuild compared this fix with main `34b667ee559d2957fd64f47d7b2a2cef07dc710e`.

## Reference

The retained real-app REA evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.
The renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
[The trace](reference-static.json) now includes `yoo`: `ACi` selects `yoo` for `r.isArchived`, otherwise `bro`.
`yoo` returns a static span without edit or menu handlers. `bro` exposes the active branch editor and Copy/Rename menu.
This is shipped-artifact static evidence, not a native behavior observation.

The trace generator checks artifact hashes against the retained REA graph. Regeneration passed:

```bash
node tools/side-by-side/trace-header-branch.mjs .rea-work/dist/assets
```

## Failure and fix

Before the fix, OpenConductor rendered the interactive branch header for archived workspaces.
A controller replay with stubbed I/O renamed `archived` to `must-not-rename`, dispatched the change, wrote the user-set marker, and copied the branch.
[The failing regression](archived-red.tap) records both that side effect and the archived button markup.

`WorkspaceBranchHeader` now selects a static branch chip before mounting the editable component.
Archiving therefore unmounts an open editor and its menu. The controller also receives the workspace status and excludes archived rename and copy operations.
Idle and needs-review workspaces retain the existing editor. This does not cancel a Git rename already submitted before archival.
No backend API, archive operation, branch presentation policy, workspace name, or adjacent WorkspaceView code changes.

## Checks

- Passed after two regression failures before the fix: `node --experimental-strip-types --test src/components/workspaceBranchHeader.test.ts src/state/workspaceRename.test.ts src/components/sidebarLabel.test.ts` — 26 tests, zero failures. [Passing output](archived-green.tap).
- Component markup uses React server rendering of the actual TSX module transformed in memory with TypeScript. Native I/O and unrelated icons/menu components are stubbed; no app bundle or server is started. Archived markup is a span; idle and needs-review markup retains Rename.
- Handler replay checks archived edit, R, change, Enter, blur, C, and direct copy produce zero I/O or dispatch calls. Existing idle Enter/blur/copy cases and a needs-review rename pass.
- Passed: `npm run lint:colors` — six checker tests and the source scan.
- Passed: `git diff --check`.
- Failed locally: `npm run typecheck` — existing dependency directory lacks `mermaid` and `dompurify`. No dependency provisioning or suppression was used. CI must check the clean-install project.

## Acceptance limits

No native app launch, install, input, capture, runtime, preview, or full app build was performed in this lane. No screenshot is available: native/browser acceptance is reserved to the serialized coordinator, and #793's native prerequisite remains separate.
React server rendering and handler replay do not prove native focus, archive-while-editing blur ordering, Git mutation, clipboard permissions, or pixel parity. Those browser/native checks remain not run.

No new REA invocation or failure occurred; the retained, hash-checked real-app extraction was reused as inert text.
