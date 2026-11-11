# Linked workspace and directory persistence

Conductor Rebuild implements the bounded contract from the retained real application, not an inferred transport capability.

## Reference identity

- `renderApp-D_fmY7hW.js`, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Picker `Auo` at decoded Unicode character index 7,461,663.
- `index-BGEQ8YjU.js`, SHA256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`. Workspace mutations `FQe/DQe` at 1,021,984 / 1,022,469; directory mutations `LQe/NQe` at 1,022,862 / 1,023,273; fresh resolver `zxt` at 3,004,812; launch options `q_` at 3,005,534; per-send configuration at 3,040,127.
- Retained Claude runtime binary SHA256 `5723ead40316bb29e3d0b446cdc82bede489cc75443d6ce08a4e6421ae6eac0d`. REA evidence `ev_5c7da8ff0653a7bc1b12da0a7e7c908edc1e25a1bcd11dffb16d454c84e23e2b`, trimmed excerpt offset 3,550,724, passes `additionalDirectories` into the SDK query. See [saved runtime evidence](../../packaging/rea/search-strings-runtime-skill.json).
- Both frontend hashes were rechecked against the retained assets manifest in this Session. Retained seven trimmed runtime snippets do not establish full live reconciliation or Codex/ACP directory behavior. No new extraction or REA invocation occurred.

## Implemented boundary

Separate workspace IDs and local directory paths persist on the source workspace. Atomic SQL mutations deduplicate adds, reject self-workspace links, and clear the last removal to NULL. Workspace rows hydrate both lists. Add > Link workspaces and `/add-dir` open the same functional picker, which toggles workspace identities and adds/removes raw directories. Failed writes report an error rather than optimistically claiming success.

The shared chat runtime retains an explicit source-workspace identity across queued messages. Each actual local Claude prompt resolves linked workspace paths from the database, omitting missing targets, then appends saved directory paths. A new Claude process receives repeated `--add-dir` arguments through the existing launcher. No cloud path or credential handoff is added.

A changed list on an already-live process rejects the next prompt with an explicit new-chat instruction. This is an OpenConductor safety boundary, not claimed Conductor reconciliation parity. It does not revoke an active process's existing access. Codex and Reason receive no invented directory parameters; the picker states these limitations.

## Verification

- Baseline hydration regression on exact main `a87a1f0547fb58064af035537d2289db083c4dff` failed: expected `['target']`, actual `undefined`. The same test passes with this implementation.
- `node --test src/features/chat/workspaceLinks.test.ts src/state/persisted.test.ts src/features/chat/chatRuntime.test.ts src/features/chat/composerSubmit.test.ts src/features/chat/composerSession.test.ts src/features/chat/composerAttachments.test.ts src/features/draft-attachments/staging.test.ts src/lib/local-storage/composerDrafts.test.ts`: 57 passed, zero failed.
- Earlier, `linkedDirectories.test.ts` plus mutation/hydration tests passed (22 total), and `npm run typecheck` passed. Subsequent dependency loss means those earlier results do not cover the final expanded diff. The later combined command failed to import `@tauri-apps/api`; the final typecheck could not find TypeScript. No install was attempted under the retained source-only gate.
- Added Rust database regressions cover persistence, deduplication, source isolation, self/missing target rejection, NULL-on-empty, current path resolution and deleted-target omission. Added stand-in Claude runner regression covers launch argv and explicit rejection of changed live directories. These are for normal PR CI, not claimed locally run.
- Native/build/runtime/browser/screenshot checks, real filesystem access by an agent, package delivery and actual Conductor live directory reconciliation are NOT RUN. Native/destination safeguards and #793's exclusive runtime ownership remain unchanged.
