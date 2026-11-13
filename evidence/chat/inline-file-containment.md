# Inline-code file containment

Conductor Rebuild owns `CHAT-INLINE-PATH-CONTAINMENT-BE7-02`. Source was checked against current main `49fde8bf788f0914dc7e53e58c5b024a9294cc61`; both leased Markdown source and test files were byte-identical to that main before adding regressions. This is a distinct successor to merged #900, which intentionally left the inline-code resolver unchanged.

## Boundary and design

The regression-head `resolveWorkspacePath` joined relative strings and admitted absolute paths by prefix before normalization. For example, `../secret.txt` and `/repo/../secret.txt` are admitted under `/repo`, and `./` names the workspace root. The code renderer turns an admitted value into a button and supplies that path to `onOpenFile`. These are source observations, not a completed runtime reproduction.

Two narrow fixes were considered:

1. Reuse the existing plain-prose resolver's lexical normalization and strict descendant check for inline code, then remove the redundant private resolver name.
2. Add a separate inline-code normalizer and containment check while retaining the prose resolver.

The fix uses the first option. Both routes now use `resolveWorkspacePath` with the existing prose normalization and strict descendant check. They need the same `string | undefined` result: a normalized absolute file target strictly below an absolute workspace, or no interactive file target. The duplicate unnormalized resolver is removed. Recognition, Markdown plugins, URL handling, code fences, explicit links and line-suffix stripping stay unchanged. This applies fix-root-causes at the resolver rather than filtering callbacks after a button is created.

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

The first publication at `52d7b6a352f0023c3cadc618a21c7f5cf652196c` added only this evidence and behavioral tests. Production code remained unchanged until ordinary automatic frontend CI demonstrated the expected failure. The correction keeps all six tests byte-identical to the regression head. Local tests, builds, installs, app/browser/native/provider execution, manual dispatches and reruns are not permitted for this slice and are **NOT RUN**.

Six new tests exercise SSR code-chip preservation for rejected traversal and root targets, normalized titles, actual rendered button callbacks, root-workspace and absent-context boundaries, and preservation of URLs, explicit links, fences and code without workspace context. Existing plain-prose and code-span assertions remain unchanged. This follows test-behavior-not-implementation: tests observe markup and callback arguments rather than private helper call order.

Automatic regression RED: **DEMONSTRATED** at `52d7b6a352f0023c3cadc618a21c7f5cf652196c` in [CI run 42831115337, frontend job 129881071294](https://github.com/reason-machines/openconductor/actions/runs/42831115337/job/129881071294). The command `node --test "src/**/*.test.ts"` reported 1,727 tests, 1,722 passed and exactly five failed. Cases 369–373 failed; the sixth new preservation case 374 and pre-existing prose/code controls 362–368 passed. The parallel frontend typecheck/build job 129881071214 passed typechecking but failed at the same five unit assertions before its build step.

The job log at lines 2,389–2,550 shows:

- Case 369 rendered `../secret.txt` as a button titled `Open /repo/../secret.txt`.
- Case 370 rendered `./` as a button titled `Open /repo/`.
- Case 371 retained dot segments in titles and omitted the contained absolute path under an unnormalized workspace.
- Case 372 exposed five button candidates instead of two normalized contained targets. This assertion failed before the callback invocation, so the RED run does not prove those callbacks executed.
- Case 373 returned `repo/src/auth.ts` for the non-absolute workspace `repo` instead of rejecting it.

Automatic fixed-head GREEN: **PENDING**. No local tests or runtime verification ran. `git diff --check` passed before publication. The unchanged test file has Git blob identity `0c2518975621632de93f0a522ff1fddcc9ada936`.

No screenshot or recording is supplied because mounted app/browser/native execution is outside the authorized scope. Mounted inline-link interaction, native parity, real-provider behavior and installed-app identity remain unverified. Ordinary hosted component tests are not proof of these behaviors.
