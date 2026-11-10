# Inline-code file containment

Conductor Rebuild owns `CHAT-INLINE-PATH-CONTAINMENT-BE7-02`. Source was checked against current main `49fde8bf788f0914dc7e53e58c5b024a9294cc61`; both leased Markdown source and test files were byte-identical to that main before adding regressions. This is a distinct successor to merged #900, which intentionally left the inline-code resolver unchanged.

## Boundary and design

The current `resolveWorkspacePath` joins relative strings and admits absolute paths by prefix before normalization. For example, `../secret.txt` and `/repo/../secret.txt` are admitted under `/repo`, and `./` names the workspace root. The code renderer turns an admitted value into a button and supplies that path to `onOpenFile`. These are source observations, not a completed runtime reproduction.

Two narrow fixes were considered:

1. Reuse the existing plain-prose resolver's lexical normalization and strict descendant check for inline code, then remove the redundant private resolver name.
2. Add a separate inline-code normalizer and containment check while retaining the prose resolver.

The first option is preferred. Both routes need the same `string | undefined` result: a normalized absolute file target strictly below an absolute workspace, or no interactive file target. One resolver avoids leaving two containment policies to drift. Recognition, Markdown plugins, URL handling, code fences, explicit links and line-suffix stripping stay unchanged. This applies fix-root-causes at the resolver rather than filtering callbacks after a button is created.

Normalization is lexical POSIX path processing only. This does not establish file existence, symlink containment, percent-decoding, line selection, filesystem access control or broader path recognition.

## Reference evidence and limits

The integrating workspace/chat owner re-read and rehashed these retained Conductor assets for this assignment. This builder does not independently retain or rehash the complete bundles. The identities match the recorded [asset manifest](../frontend/tauri-assets-manifest.json):

- Renderer `renderApp-D_fmY7hW.js`, 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index `index-BGEQ8YjU.js`, 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The owner's static decoded-byte trace records:

- Renderer `xXs` at byte 6,536,881 visits inline code outside links, uses `_Xs` at 6,536,344 and emits `conductor-file-code://` links with the inline-code child preserved.
- `SXs = [wXs, xXs, Rzs]` reaches `dHn` at 6,548,274 through `BXs`. `pEi` at 6,548,725 supplies `cEi` and the file navigation callback.
- `cEi` at 6,541,795 resolves via `RX`; it renders `IXs` at 6,540,107 only for an accepted target. Rejected internal file links remain noninteractive spans. The reference callback uses the resolved relative path and optional line number; the title uses the absolute path. This change preserves OpenConductor's existing absolute-path callback API.
- Renderer import `fA as RX` maps to index export `WGt as fA` at 3,483,304. `WGt` at 824,321 uses `_ne` at 823,036 and `aKe` at 822,816, rejects schemes, calls `Ud`, and rejects empty relative paths.
- `Ud` normalizes the workspace and target with `Qt.resolve`, then `wne` requires equality or a separator-delimited descendant. `WGt` rejects equality by rejecting the empty relative path.

REA identity `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` parsed the index, but the full renderer was skipped after worker heap exhaustion. Renderer evidence is the retained manual decoded-byte fallback, not complete semantic analysis or native/runtime proof. [Existing REA gaps](rea-gaps.md) remain open. No new acquisition, REA run or reference execution occurred.

## Regression sequence

The first publication adds only this evidence and behavioral tests. Production code is deliberately unchanged until ordinary automatic frontend CI demonstrates the expected failure. Local tests, builds, installs, app/browser/native/provider execution, manual dispatches and reruns are not permitted for this slice and are **NOT RUN**.

Six new tests exercise SSR code-chip preservation for rejected traversal and root targets, normalized titles, actual rendered button callbacks, root-workspace and absent-context boundaries, and preservation of URLs, explicit links, fences and code without workspace context. Existing plain-prose and code-span assertions remain unchanged. This follows test-behavior-not-implementation: tests observe markup and callback arguments rather than private helper call order.

Automatic regression RED: **PENDING**, not yet demonstrated. Automatic fixed-head GREEN: **PENDING**, no fix published yet. The normal CI command is `node --test "src/**/*.test.ts"`.

No screenshot or recording is supplied because mounted app/browser/native execution is outside the authorized scope. Mounted inline-link interaction, native parity, real-provider behavior and installed-app identity remain unverified. Ordinary hosted component tests are not proof of these behaviors.
