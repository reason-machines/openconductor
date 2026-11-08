# Read-only Markdown file preview

Conductor Rebuild, 2026-11-07. This is source/test evidence, not visual or native acceptance.

## Retained REA reference

The existing REA extraction owner (Session `13576d11-76fb-4842-aa9b-c398f9ca26f3`) supplied inert renderer source from Conductor's `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

- `jqo`, UTF-8 bytes `[9641484,9642975)`: the Markdown preview branch renders `eee` with file text and workspace/file identity.
- `eee`, bytes `[7522995,7523518)`: consumes `markdown_style`; `tufte` selects `Yuo`, otherwise `xS`.
- `lUt`, byte offset `7881661`: case-insensitive Markdown/MDX eligibility.
- `Bvs`, byte offset `2714778`: file-tree navigation calls `navigateToFile({path,mode:"edit"})`.
- `_ji`, byte offset `9646873`: navigation view mode is distinct from content mode. It consults persisted content mode only without an explicit navigation view mode, then defaults eligible untargeted files to preview.

This patch implements only the read-only Markdown file preview and style consumer. It does not implement or claim parity for Conductor's edit mode, line targeting, persistence scope, preview exclusion predicates, local links, images, or the complete Tufte renderer. Exact persisted-mode scope and preview exclusion functions remain REA gaps. No fresh extraction or native execution was performed.

## Product boundary

All files delegates `.md`/`.mdx` to one workspace-owned internal preview tab. Other files and trees without a viewer keep the external-opening path. The preview has an explicit Open externally action, also available after a read error. It does not write files, save drafts, execute MDX/HTML, load remote images, or change chat Markdown rendering. Only explicit HTTP(S) links open externally.

The IPC read accepts a selected workspace root and normal relative path. On Unix, every child component is opened relative to an owned directory descriptor with `O_NOFOLLOW`; intermediate components require directories. Symlinks (including in-workspace ones) are conservatively rejected. The final open is nonblocking, metadata must identify a regular file, and at most 4 MiB + 1 byte is read before UTF-8 validation. This is a confined read below the caller-selected root, not authorization of that root or an app-wide OS sandbox. Other platforms return an external-fallback error.

## Verification

- Two source-wiring tests fail against main `aacf1be68` (no internal handler or host), then pass on this patch. This is a static integration regression, not a wheel/click or native reproduction.
- `node --experimental-strip-types --test src/features/files/*.test.ts`: eligibility, rendered GFM/default/tufte output, inert HTML/MDX, safe links, asynchronous success/error/cancellation, integration wiring, and existing tree behavior.
- `cargo test --locked --manifest-path tools/markdown-read-tests/Cargo.toml`: six focused tests run the actual product read module, including UTF-8, size, traversal, directory/missing file, symlink and FIFO rejection. CI runs this harness on Linux and macOS without the Tauri build.
- `npm run typecheck`, `npm run lint:colors`, and `git diff --check` are source checks.

Browser/runtime/native/package acceptance and screenshots are NOT RUN: this lane has no runtime/build/native admission. No pixel-parity claim. Source tests do not prove tab layout, native IPC registration, packaged rendering, native scrolling or live settings persistence.
