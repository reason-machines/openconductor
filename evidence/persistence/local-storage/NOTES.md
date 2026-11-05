# Local-storage subsystems (`db.local-storage`)

Conductor 0.87.6 keeps small client state in file-backed *local-storage subsystems* next to `conductor.db`. The 11 subsystem files named in [`../../sqlite/README.md`](../../sqlite/README.md) (`local-storage.subsystem.*.json`) are this layer's `subsystemStore` storage. Builder obligation `db.local-storage.stores`, parent REA ledger obligation `db.local-storage` (next evidence: "format of local-storage.entries files").

Sources, all read on Sven's Mac ("sven m5 max") from the decoded frontend (`~/code/conductor-rea-work/frontend/dist/assets`, produced by `tools/extract_tauri_assets.py`). Bundle code is untrusted data; nothing from it is copied into this repo beyond names, numbers and shapes.

| Chunk | sha256 | Bytes read |
|---|---|---|
| `index-BGEQ8YjU.js` | `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3` | 218700-240700 (schemas, paths, write batcher, encryption, `setEntry`/`getEntry`/`listEntries`/`removeEntry`/`removeSubsystem`, file backend); call sites at 662924, 704263, 1077112, 2475543, 2805300-2808900, 2880061, 3130166, 3171268 |
| `renderApp-D_fmY7hW.js` | `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` | call sites at 382407, 1774049, 2708321, 7341118, 7573880, 9764588 |

Offsets were found with `grep -boa` for the subsystem names, `entryStorage`, `protection:"encrypted"` and `local-storage.subsystem.`.

## Format

- Index `local-storage.metadata.json` (app data folder): object, subsystem name -> `{subsystem, sizeLimit, totalSize, entryStorage: "subsystemStore" | "entryFile", protection?: "encrypted", entries: [{id, size, lastUpdatedAt}]}`. `size` is `TextEncoder` byte length of `JSON.stringify(value)`; `lastUpdatedAt` is `new Date().toISOString()` unless given.
- `subsystemStore`: one file `local-storage.subsystem.${encodeURIComponent(name)}.json`, an object mapping entry id -> the entry's JSON text (a string; `getEntry` returns `JSON.parse` of it).
- `entryFile`: `local-storage.entries/${enc(name)}/${enc(id)}.json` (over 255 bytes: `%local-storage-entry-sha256-<hex>.json`), directories mode `0o700` (`448`). Encrypted entries are AES-GCM envelopes (see [`../../terminal/NOTES.md`](../../terminal/NOTES.md)); plain ones are the JSON text.
- Default storage: `entryFile` when `protection: "encrypted"`, else `subsystemStore`.
- Store files (index and subsystem stores) are written with `writeTextFileAtomic(path, text, {mode: 384})` (0600). Writes are batched: each store path is scheduled 100 ms after its last change, and the index is flushed after the subsystem stores (`comparePaths` sorts `local-storage.metadata.json` last); a `pagehide` listener flushes. An unreadable store is logged ("Discarding unreadable local storage store") and read as `{}`.
- All operations go through one serial queue.

`setEntry({subsystem, sizeLimit, id, content, lastUpdatedAt?, entryStorage?, protection?, onlyIfMissing?})`:

1. `JSON.stringify` throws or returns a non-string -> `{success:false, reason:"notJsonSerializable"}`.
2. size > `sizeLimit` -> `entryTooLarge`.
3. Existing record's storage wins; if the caller names another -> `entryStorageMismatch`.
4. `onlyIfMissing` and the id exists -> `{success:true}`, nothing written.
5. Entries = others + this one appended; total = old total - old size + size; while total > limit evict the other entry with the smallest `lastUpdatedAt` (first one on ties); still over -> `subsystemFull`.
6. Read previous content (for rollback), write content, write index record (with the caller's `sizeLimit`); if the index write fails, restore or delete the content and rethrow; then delete evicted contents (errors logged).

`removeEntry` writes the index without the entry, then deletes content. `removeSubsystem` deletes every entry's content, the index key and the subsystem store file. `listEntries` returns `[{id, size, lastUpdatedAt, content}]`, throwing "Missing local storage entry ${subsystem}:${id} content" when listed content is gone.

## The 11 `subsystemStore` subsystems

None passes `protection` or `entryStorage` except `turn-changes-cache` (explicit `subsystemStore`), so all 11 are unencrypted `subsystemStore` files.

| Subsystem | Size limit | Entry id | Entry value | Chunk:offset |
|---|---|---|---|---|
| `browser-local-storage` | 5 MiB | key | string; a `Storage`-like adapter (`getItem`, `setItem`, `removeItem`, `clear`, `key(i)`, `length`) | index:224477 |
| `claude-context-windows` | 64 KiB | model id | context window number; hydrated into a store, persisted on change | index:1077112 |
| `composer-drafts` | 5 MiB | session id | string, or `{message, attachments: [{attachmentId, commentId?, originalName, path, type: image\|pdf\|text\|review\|file, status: staged\|uploading\|uploaded\|failed, error?, metadata?, sourceRef?, asset?: {assetId, relativePath}}]}` | index:2475543 |
| `dispatcher-state` | 1 MiB | `dispatcher-state-v1` | zustand `persist` JSON of the new-workspace dispatcher store (its state has last repository per org, hosting target, create-from tab, target branch per repo, draft; which fields `partialize` keeps was not read) | renderApp:7341118 |
| `model-picker-configs-v1` | 64 KiB | model id | `{effortLevel?, fastMode}`; `lastUpdatedAt` is the model's last-used time | renderApp:7573880 |
| `opencode-model-discovery-v1` | 4,194,304 B | `JSON.stringify([repo id, main worktree path, opencode executable path])` | `{models, modelConfigOptions: [{modelId, snapshot}]}` | renderApp:382407 |
| `pre-workspace-completions-v1` | 5 MiB | `completion:<target key>` | `{type: "pre_workspace_completion", version: 2, target, updatedAt, data: {files, slashCommands, skills}}`, fresh for 5 min; version 1 upgraded on read | renderApp:9764588 |
| `route-user-state` | 5 MiB | `route-user-state-v1` | zustand `persist` JSON `{routeStates: {routeKey: {stateKey: value}}}`; route key `[routeId, ...scope].map(encodeURIComponent).join("/")` | renderApp:2708321 |
| `run-script-history` | 5 MiB | `run-script-history-v1` | zustand `persist` JSON; per-workspace task id history, at most 20 ids | index:2880061 |
| `terminal` | 100 MiB | `terminal-panel-tabs-v1` | zustand `persist` JSON `{terminals, workspaceTerminals, activeTabPerWorkspace, lastTabKind}` | index:2806576 |
| `turn-changes-cache` | 5 MiB | `JSON.stringify([sessionId, turnId])` | array of turn file changes | index:3130166 |

zustand `persist` subsystems use an adapter (index:2805300-2806350) whose `getItem/setItem/removeItem` map the persist name to one entry (`setItem` throws "Failed to persist local storage entry ${subsystem}:${id}: ${reason}").

Other subsystems seen, not in the 11 (they use `entryFile`): `terminal-history` (encrypted, terminal history store), PR info per workspace (index:662924), workspace changes (index:704263), file diffs (index:3171268, 25 MiB), `lottie-sprite-cache` (renderApp:1774049; the one present after a first run, `../../runtime/first-run-files.tsv`).

## Rebuild

| Part | Where | Tests |
|---|---|---|
| Store: the `subsystemStore` half (index record, `setEntry` steps 1-3, 5-6, `getEntry`, `removeEntry`, `listEntries`, `removeSubsystem`, discard-unreadable, 0600 atomic writes), sharing one process-wide lock on `local-storage.metadata.json` with the encrypted `terminal-history` entries | `SubsystemStore` in [`history_store.rs`](../../../src-tauri/src/terminal/history_store.rs) (the Terminal area's, extended here with `list_entries` / `remove_subsystem`) | `subsystem_store_*` tests there, via [`tools/terminal/run-rust-tests.sh`](../../../tools/terminal/run-rust-tests.sh) |
| IPC `local_storage_{get_entry,set_entry,remove_entry,list_entries,remove_subsystem}` | [`local_storage_commands.rs`](../../../src-tauri/src/local_storage_commands.rs) | argument shape tests; app build in CI |

Differences from the reference:

- The backend writes the files (Conductor's frontend writes them through the fs plugin). Content crosses IPC as JSON text, so sizes and stored bytes match `JSON.stringify`.
- Writes go to disk on each call instead of a 100 ms batch; the order (content, then index) is the same, so a crash leaves at worst an unlisted entry, as in the reference.
- Object keys in the index and store files are written sorted (serde_json), not in insertion order. Readers parse JSON, so only the bytes differ.
- The plain-store commands refuse encrypted and `entryFile` subsystems (`entryStorageMismatch`); `terminal-history` is written only by `LocalStorage` in the same file, under the same lock.
- `setEntry`'s `onlyIfMissing` (step 4) and a caller-chosen `entryStorage` are not taken; every caller here uses `subsystemStore`.
- Protection migration between encrypted and unencrypted storage (only used by `terminal-history`) is not built.

## REA

- REA `analyze-javascript-application` on the index chunk alone (`~/code/conductor-rea-work/pr-rea/ajs_index.json`, Evidence `ev_ed84d75ccb95a40cc1e33f548754ea751c7b2923f173806870054005b3164fd5`): 0 occurrences of `local-storage.subsystem`, `local-storage.metadata.json`, `local-storage-entry-encryption-key-v1`, `subsystemStore`, `composer-drafts` or `turn-changes-cache` in the whole Evidence; `writeTextFileAtomic` appears twice. **REA gap:** string constants that name storage are not retained, so REA cannot answer "which subsystems exist" or "what file does this write".
- The whole-app Evidence (`../../frontend/rea-analyze-javascript-application.json.gz`) records these calls as `storage` findings with `storage_kind: "local-storage"`, `name: null`, `mechanism: "call:localStorage.listEntries"` and similar. **REA gap:** a method named `localStorage` on an app object is classified as the browser's Web Storage, and the subsystem argument is dropped (`name: null`), so the finding points at the wrong storage and loses the key.
- `trace-javascript-semantics` was not rerun: its input embeds the whole application Evidence (hundreds of MB) and earlier literal-seed runs found 0 seed nodes (`../../rea/rea-invocations.tsv`). The format above was read by byte offset instead, as for terminal history.
