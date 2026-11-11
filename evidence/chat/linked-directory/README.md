# Local linked-directory picker

Conductor Rebuild, 2026-11-06. This is a callback-only local-directory picker, not workspace-link persistence or complete composer integration. Composer/Workspace wiring is owned by the coordinating Session.

## Identity and observations

Read-only `shasum -a 256 /Applications/Conductor.app/Contents/MacOS/Conductor` on Sven's authorized **sven m5 max** returned `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`. The cloud reference binary has the same SHA256. Its decoded render asset `renderApp-D_fmY7hW.js` hashes to `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching the [extraction manifest](../../frontend/tauri-assets-manifest.json). No native UI or user data was changed. Implementation and verification ran on Reason Cloud; reference identity was also read directly on the Mac.

Fresh REA 6.8.0 `capture-browser-scenario` captures against this decoded frontend are in [reference-captures.json](reference-captures.json), with exact scenario inputs and Evidence IDs. The browser harness supplies synthetic local repositories/workspaces and prevents external connections. These are **not native macOS screenshots**.

Observed in those captures:

- Add → Link workspaces and selecting `@add` with Enter open the same picker. The mention token is gone afterward.
- The dialog has a search input, a Directories group with Browse..., then eligible workspaces grouped by repository. The current repository is omitted.
- A search with no matching workspace leaves Browse... visible and shows no empty-state message. The decoded source contains a `No workspaces found` literal, but its command-empty primitive is hidden while Browse remains. Runtime observation, not that literal, determined this implementation.

Direct bounded reads of the decoded bundle supplement REA runtime evidence (not successful REA source analysis): `Auo` at character 7,461,663 filters out the current repository and searches directory name, branch and repository name case-insensitively; Browse calls the native directory dialog with `directory: true`, `multiple: false`, title `Select directory to link`. `Euo` draws workspace rows, `Cuo` draws existing directory links. `oEe` at 623,407 uses the Lucide folder-symlink geometry. These are decoded character offsets, not native addresses. The [existing REA JS source-analysis gap](../rea-gaps.md) still applies.

## Boundary and ownership

`LinkedDirectoryPicker` accepts `repos`, `repositoryId`, optional `excludedPaths`, `onChoose(path)`, and `onClose()`. The caller mounts/unmounts it, passes the active/already-linked paths in `excludedPaths`, persists links or attachment state, and closes after a selection. Optional `services` supplies the browse and directory-inspection boundary for isolated verification.

The default services use the local native directory dialog and existing read-only `inspect_project_folder` command. Plain browser use fails explicitly rather than inventing a successful filesystem check. Every selected path, including an existing-workspace row, must be absolute, contain no controls or dot traversal, not be excluded, and pass an existence/directory check before the callback runs. Cancel returns nothing. Duplicate requests are suppressed and late results after dismissal/unmount are ignored.

Model the Domain shaped the idle/checking/error union; Type System Discipline kept external IPC untyped until its `isDir` boolean was checked. No linking mutation, agent launch, API credential handoff, local Claude/Codex cloud path, or org/team/routine/triage/cloud-workspace UI was introduced. No excluded owner files, root dependencies or package files were edited.

## Checks

Passed:

- `node --test src/features/chat/linkedDirectories.test.ts`: seven domain/API tests.
- `npm run build`: TypeScript and production Vite build, with existing chunk/import warnings.
- `node --test --test-concurrency=4 "src/**/*.test.ts"`: 1,265 passed, zero failures.
- `npm run lint:colors`: six checker tests passed; no forbidden colour literals.
- `git diff --check`.
- `CHECK_LINKED_DIRECTORY=1 CAPTURE_LINKED_DIRECTORY=1 node tools/linked-directory/serve.mjs ours`, launched through `preview_start`: seven browser interaction groups passed. See [browser-checks.json](browser-checks.json). Covers search, grouping, keyboard selection, callback/close, Browse with no results, cancellation, invalid/deleted/unreadable directories, repeated selection, dismiss-during-validation, focus trapping/restoration, Escape/backdrop, long-list scrolling and small light viewport.
- Fresh REA captures of the actual component fixture: [ours-captures.json](ours-captures.json). The side-by-side crops are unscaled and do not normalize colours, dimensions or content.

The first browser focus-trap assertion sampled the focus guard synchronously during Base UI's deferred focus restoration. A manual visible-browser Tab check observed focus return to the input. The check now waits for the same in-dialog focus condition; it was not removed or weakened. A first reference-server start lacked the separate `tools/screens` sql.js dependency; installing that fixture's one existing dependency fixed it without changing shared root node_modules. Neither was a new REA bug. No other new REA gap was encountered; source-range analysis retains the limitation cited above.

## Gaps

- Native Conductor/WebKit visual behavior, native OpenConductor Browse, and the actual native inspection IPC were not exercised. Browser services are injected; they prove the component's validation/control flow, not macOS permissions or filesystem access.
- Existing linked-directory/workspace toggle/unlink management, persistence, composer entry points, chips and subsequent agent access are deliberately outside this independent slice.
- UI comparison covers the empty-linked-state and a no-match query in the dark Stone theme. A small light-theme long-list interaction was checked, not a full light-theme parity capture.
- Exclusion is normalized-path equality, not filesystem canonicalization: aliases/symlinks to the same directory are not deduplicated.
- No real Claude Code, Codex or Reason prompts were sent; no production deployment or signed-in runtime behavior is claimed.

## Reproduce

Use `preview_start` for both commands, one at a time, with an available port. The REA process and server must share the preview network context. Stop this Session's preview afterward.

```bash
npm install --prefix tools/screens --ignore-scripts --no-audit --no-fund
DIST=/home/runner/conductor-ref/dist CAPTURE_LINKED_DIRECTORY=1 node tools/linked-directory/serve.mjs reference
# default port 4438; REA defaults to /home/runner/rea/node_modules/.bin/rea
CHECK_LINKED_DIRECTORY=1 CAPTURE_LINKED_DIRECTORY=1 node tools/linked-directory/serve.mjs ours
# default port 4437
python3 tools/linked-directory/compose.py
node tools/linked-directory/report.mjs
```

The binary and decoded reference cache are third-party artifacts kept outside the repository. All runtime workspace data and directory responses in these captures are synthetic. No real user-data writes were performed.
