# persistence.draft-attachments: Conductor's `draft-attachments/` store

Builder obligation `persistence.draft-attachments` (parent `agent.attachments`).
Files attached in the composer before a workspace is ready are staged under the
app data directory and copied into the workspace once it is ready.

| Piece | OpenConductor |
| --- | --- |
| Store (std-only core) | [src-tauri/src/draft_attachments.rs](../../../src-tauri/src/draft_attachments.rs) |
| Tests | [src-tauri/src/draft_attachments_tests.rs](../../../src-tauri/src/draft_attachments_tests.rs) |
| IPC commands | `draft_attachments::commands` (registered in `lib.rs`) |
| Startup sweep | `draft_attachments::sweep_at_startup` in `lib.rs` setup |
| Frontend API | [src/features/draft-attachments/](../../../src/features/draft-attachments/) |
| Harness | [run-tests.sh](run-tests.sh) (no Tauri/WebKit needed) |

## Behaviour (Conductor 0.87.6)

Read from the shipped frontend bundle `frontend/dist/assets/index-BGEQ8YjU.js`
(extracted from `/Applications/Conductor.app` on Sven's Mac) and the strings
of `Conductor.app/Contents/MacOS/conductor`. Byte offsets are into that bundle.

1. **Staging root** (`@2285927`): `const hvt="draft-attachments"`;
   `vle() = join(Gf(), hvt)` where `Gf` is
   `plugin:path|resolve_directory {directory: AppData}`
   (`~/Library/Application Support/com.conductor.app`). Per workspace:
   `yle(id) = join(root, id)`. The Rust binary also carries the literal
   `draft-attachments` (strings line 503).
2. **Path mapping** (`fle`, `@2280348`): `const Iv=".context/attachments"`.
   A relative path must start with `.context/attachments/`, else
   `Staged attachment relativePath must start with ".context/attachments/": <path>`.
   Stored path = `<root>/<id>/<relativePath minus prefix>`.
3. **writeDraftAttachment** `{draftWorkspaceId, relativePath, data}`:
   `mkdir -p dirname(stored)`, then write the bytes.
   **removeStagedAttachment**: no-op (logged) when absent, else remove the file.
   **resolveStagedAttachmentLocation** returns `{storedPath, host}`.
4. **Callers** (`@3052648`): `stageAttachmentSource` waits for the workspace to
   initialize, builds `.context/attachments/<random 6>/<sanitized name>` (`tvt`,
   `@2277531`), reads the source file and stages it. Session attachments resolve
   their staged copy with `Ym` and copy it with `mle`, then `completeDelivery`
   removes the staged copy (`@3055504`).
5. **materializeDraftAttachments** `{localWorkspaceId}` (`uvt`, `@2285750`):
   no-op if the staging dir is missing; collects only `<staging>/<dir>/<file>`
   entries (directories at the first level, files at the second) as
   `.context/attachments/<dir>/<file>`; waits for the workspace, resolves its
   path, copies each with `materialize_local_path_attachment
   {sourcePath, destinationPath}`; if every copy succeeded, removes the staging
   dir recursively (warn `Failed to remove draft attachments dir after upload`).
   **uploadStagedAttachmentToWorkspace** copies one file then removes the staged
   copy (warn `Failed to remove staged attachment after upload`).
6. **Orphan sweep** (`cvt`, `@2282319`): `avt = 720*60*60*1e3` (30 days). For each
   directory directly under the root: skip if `mtime` unknown or
   `now - mtime <= avt`, else remove recursively; on error warn
   `Failed to sweep orphaned draft attachments dir`. No-op when the root is
   missing. It runs once at app start: `g8t` is exported as `tL` and called
   from the startup effect in `renderApp-D_fmY7hW.js` (`@11489380`,
   `Nkr().catch(...)`).
7. **materialize_local_path_attachment** (Rust, handler
   `conductor_lib::attachments::materialize_local_path_attachment` per
   evidence/ipc/ipc-rust-bindings.json): args `sourcePath, destinationPath,
   remoteUpload, resizeImage` (binary strings line 9). Strings from
   `src-tauri/src/attachments.rs`: `Exactly one of destination_path or
   remote_upload must be provided`, `Expected an attachment destination`,
   `Invalid attachment source path`, `Failed to read attachment source
   metadata`, `Failed to open attachment source file`; resizing shells out to
   `sips` (`-s format ... formatOptions --resampleWidth --out`, `-g`) and can
   fail with `Could not produce an image attachment within Claude size limits`.
   The draft paths above never pass `resizeImage`.

## OpenConductor implementation

- `DraftAttachments::{resolve, write, remove, upload_to_workspace,
  materialize_all, sweep_orphans}` follow 2-6 with the same names, prefix,
  error message, 720 h boundary (exactly 720 h is kept) and
  "remove staging only if every copy succeeded" rule. Warnings go to stderr with
  Conductor's messages.
- `materialize_local_path_attachment(source, destination)`: the source must be a
  regular file; creates the destination's parent dirs, then copies (overwrites).
- The workspace path is passed in by the frontend (Conductor resolves it in the
  frontend too, via its workspace store).
- The sweep runs from Rust `setup` on a background thread instead of from a
  frontend startup effect; the result is the same (once per launch).

Deliberate differences:

- Hardening: workspace ids must be a single normal path component and the part
  after `.context/attachments/` may not contain `..`, a root or be empty.
  Conductor's frontend joins with `path.join`, which would normalize `..` out of
  the staging root.
- Not reconstructed: remote workspaces (`remoteUpload`,
  `upload_file_to_remote_workspace`), `resizeImage`/`resize_image`, and
  Conductor's per-attachment upload tracking (`NW`/`hI` `endUpload`), which
  belongs to the composer, not the store.
- IPC: Conductor's frontend does the file I/O itself through
  `tauri-plugin-fs`; OpenConductor does it in Rust commands
  (`draft_attachment_write/resolve/remove/upload`,
  `draft_attachments_materialize`) so the logic is testable without a webview.

## Checks

| Check | Command | Result |
| --- | --- | --- |
| Rust core, 14 tests + clippy `-D warnings` | `evidence/persistence/draft-attachments/run-tests.sh` | pass |
| Frontend API, 3 tests | `node --test src/features/draft-attachments/staging.test.ts` | pass |
| Typecheck | `npm run typecheck` | pass |
| Tauri app build with the commands | CI `app` job (needs WebKit; not buildable on the Linux builder) | see PR |

## REA gaps and bugs hit

1. **Rust handler body not decompiled yet.** Whether
   `materialize_local_path_attachment` copies, hard-links or renames, and whether
   it creates the destination's parents, is not proven. REA's only route to a
   function body is a Ghidra `trace`/`decompile`, which re-imports the 70 MB
   binary per call (~30-45 min; rea-test-report.md items 13 and 16). A
   `rea trace --query=materialize_local_path_attachment --provider ghidra` run
   was started on the Mac at 2026-11-05T15:26Z
   (`~/code/conductor-rea-work/draft_attach_trace.sh`, output
   `out/ghidra_trace_materialize_local_path_attachment.json`) while two other
   Ghidra runs were using the CPU. Until it lands, the copy + `mkdir -p`
   behaviour is inferred from the strings (`Failed to copy`, `the source path is
   neither a regular file nor a symlink to a regular file`, which is std's
   `fs::copy` error) and from the draft flow writing into
   `.context/attachments/<new dir>/` that nothing else creates.
2. **No byte-range read in REA for JS bundles.** Finding the store took plain
   `python`/`grep` over the extracted bundle: REA's JavaScript analysis
   (`analyze-javascript-application`) hits its parent result budget on this
   bundle (`resource_constraint`, seen in the existing trace outputs) and has no
   "show source around offset N" operation.
