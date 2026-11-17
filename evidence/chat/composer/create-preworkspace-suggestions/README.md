# Repository/ref-qualified Create suggestions

Conductor Rebuild. Implemented on Reason Cloud; default main re-integrated at `5284779b7cb8705170b64968cc92eefd3a4740a0` (2026-11-17). This is a separate main-based successor to merged #1421, not stacked or appended to that PR.

## Change and authority boundary

Create's page and dialog now load local completion snapshots keyed by repository ID, selected source ref and agent. `@` files/directories and `/` commands/skills reuse the existing suggestion menus, matching and editor insertion handles. Enter/Tab choose; Escape stays inside the popup. Lookup/query responses cannot revive after identity changes or unmount. Both Create request boundaries serialize rich file drafts with `composerPrompt` rather than deliver an internal envelope.

The callable `pre_workspace_completions({ repositoryId, ref, agentType })` is **our implementation**, not a reconstruction of an observed proprietary native body:

- Existing `WorkspaceService` resolves repository identity to its authoritative local root.
- A validated selected ref is resolved once to an immutable commit; bounded tree/blob object reads use that identity, never dirty cwd/HEAD fallback.
- Relative paths include directories. Existing Claude/Codex command/skill scanners read only bounded selected-ref metadata in a private persistent cache. Allowed skill resources are retained; Git executable files remain owner-executable, not world-accessible.
- Existing global local-folder precedence is retained. Reason/ACP uses the existing empty local command/skill fallback, without launching a provider.
- Bad/missing/deleted refs, repository/pointer replacements, unsafe cache contents and capacity/size overruns fail explicitly. No checkout, network, provider, workspace, index or repository-registry mutation.
- Skill paths remain valid for existing Codex `skill_links` parsing. This uses OpenConductor's existing path-link grammar; **Conductor's section-sign skill atom/document parity is not implemented or claimed**. Shared Editor/document/schema are byte-identical.

## Retained original evidence

Retained REA-derived renderer SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`; index SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

`Hji → PQo → RQo/AQo → CQo` establishes a selected repository/source/ref snapshot before workspace creation. `OQo → NQo` queries/ranks supplied files, `rki → nce → eki` inserts a file atom and space. `DQo → jNi` merges commands and skills; ordinary commands insert text, and skills use a distinct atom. `lHt → o5o` closes actual editor/range selection and Enter/Tab dispatch.

`reference.json` keeps 19 bounded inert spans/joins, original byte ranges and hashes. No full asset is published or evaluated. Verification against retained parent assets passed **81 checks**:

```bash
python3 evidence/chat/composer/create-preworkspace-suggestions/verify-reference.py --assets .qa/create-suggestions-135/retained
```

Without local retained assets, the same script verifies embedded spans/self-hashes and joins. The proprietary native `fetchPreWorkspaceCompletions` implementation remains unobserved. In particular the reference's GitHub tree fetching/caching is not claimed as our local immutable-tree implementation.

## Frozen baseline and tests

Original mounted fixture SHA-256 `0eb33cd4b22788f5ed2004a958398e5a923ec17c75c8f0e3ae4ebea58e657193`, retained byte-for-byte under `history/fixture-v1.test.ts.gz`.

The actual baseline on main `29c82d0bf7` and freshly replayed `5c12f27036` is **6 pass / 14 intended failures**, no skipped/cancelled tests. Candidate menus reached two previously-unexercised fixture environment omissions: no document listener methods and no CommonJS default-import interop. Version 2 adds only listener noops and `esModuleInterop`; all twenty test bodies/assertions are identical. The same corrected fixture was refrozen, baseline replayed **6 pass / 14 fail**, then candidate **20/20 pass**. Both histories and failed environment run are retained, not misrepresented as product failures.

```bash
CREATE_SUGGESTIONS_REF=5c12f27036aec2e75e8a3dc80d462f0fd249680e node --test src/components/createWorkspaceSuggestions.test.ts
node --test src/components/createWorkspaceSuggestions.test.ts
node --test src/components/createWorkspaceSuggestionsControls.test.ts
```

**Passed:** 20 mounted regressions plus 18 additional page/dialog controls. Real Create dialog/page → real shared ComposerEditor; TipTap DOM adapter is inert, real ProseMirror state/schema transactions run. Controls exercise selected branch/PR/fork ref, repository and agent identity, old-response cancellation, unmount, errors, skill grammar, no submit on selection, blur/Escape, and rich-envelope normalization at both submit/backlog request boundaries. Synthetic IPC responses are not real backend/provider delivery. The extended fixture's model-picker boundary is inert; no provider/model selection parity is inferred.

```bash
node --test src/components/createWorkspace*.test.ts src/features/chat/composer*.test.ts src/features/chat/modelPicker*.test.ts src/keybindings/*.test.ts
npm run typecheck
npm run build
```

**Passed on the final main-integrated tree:** integrated suite **691/691** (0 skips/cancellations), separate typecheck, and production branding/TypeScript/Vite build (existing large-chunk warning only). See `final-integrated.tap.gz`, `final-typecheck.log.gz` and `final-build.log.gz`.

The first integrated run had **631 pass / 60 import-loader failures** in three older VM fixtures before assertions. Their explicit real-module import maps and CommonJS interop were extended; existing inert native boundaries now explicitly report `isTauri: false`. No unknown import fallback, test skipping, assertion removal or tested behavior mock was added. All 60 cases pass afterward. Exact originals/hashes are preserved under `history/`; `fixture-preservation.json` verifies every test call body unchanged. Shared Editor/document/schema hashes are retained and rechecked.

## Callable local adapter verification

```bash
python3 src-tauri/src/pre_workspace_completions/run-tests.py
```

Helper **passed 18/18 and Clippy `--all-targets -- -D warnings`**, after rustfmt formatting (not `--check`), on exact delivered helper head `239f335de6ffe89eabf3de53ad9b49aa22d3feb0`. The recovered original command/output is retained in `native-helper-existing-verification.txt`; the helper did not rerun or edit code while recovering it. Its three-commit patch SHA-256 `8628ae753a05369a38a32f1101c0ef6d3c1a2cf726087e8b8bbc692eb2d4ccbb` was verified before integration.

Parent integration **passed all 18 tests** twice. Its combined command is **partial**: the clippy phase cannot start because this checkout's toolchain lacks `cargo-clippy`; a component-install attempt failed against a read-only toolchain cache. This is not a clippy verdict from the parent. Helper exact-source lint evidence is recorded separately, not silently substituted for a parent pass.

The harness uses actual WorkspaceService, scanners, DTOs and `skill_links`, with a signature-stubbed Tauri edge. Tests cover two refs with distinct files/commands/skills/resources, dirty checkout exclusion, branch movement/deletion, missing refs, repository replacement/isolation, linked-worktree pointers, bounded cache capacity/tampering/symlinks, exact schema/wiring and no worktree/index/registry mutation. The raw keyword argument maps to JS `ref` according to the locked Tauri macro's `ident.unraw` conversion; this is source inspection, not full IPC execution.

## Remaining gaps and release custody

Full Tauri/macOS compilation and IPC, browser/default-action/IME/WebKit, real agent/provider execution, installed app, package containment and native behavior **not run/unverified**. No screenshot is supplied because this lane has no browser/native runtime admission and no new runtime acquisition was requested. These source/mounted/harness results must not be called native parity.

No package/runtime/native dispatch or duplicate watcher was created. Existing package #1791 at `eef01e9b` excludes this successor and #1421 unless separately proven. Existing release custodian `992a715e` retains actual #1421 merge `e5b7027de6826131a7d753e1580eeea7ac2725ce`; this successor's actual merge pin must be delivered there after merge. Cache retention is capped at 64 snapshots; reaching the cap produces an explicit error rather than deleting paths already held in drafts.
