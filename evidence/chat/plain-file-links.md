# Plain assistant file links

Conductor Rebuild implements `CHAT-PLAIN-FILE-BE7-01` on main base `d9b8d335f93c13176640436b89a75d8c9a2ea209`. The assigned branch remains `reason/openconductor-omit-nonco-8e693aec`. This is a focused successor to merged #877, not a change to that pull request or stopped #847.

## Defect and chosen design

Before this change, `Markdown` renders `See src/lib/auth.ts.` as plain text even with a workspace and `onOpenFile`. Only its `code` component calls `resolveWorkspacePath`, so a backtick code span can navigate but ordinary prose cannot.

Two designs were considered:

1. Add a remark text-node visitor and annotate generated links for the existing link renderer. Markdown owns link/code boundaries, and the renderer owns the workspace callback.
2. Recursively replace text while rendering React children. This requires traversing arbitrary component output and separately tracking explicit-link and code ancestors.

The first design keeps recognition in the Markdown tree and introduces no caller API. It follows the foundational-thinking principle by representing each candidate as an annotated mdast link rather than sharing mutable rendering context. No additional agents or prototypes were started.

`remarkPlainFilePaths` skips entire explicit-link and reference-link subtrees. Code nodes have no text children and are unchanged. Recognized prose paths receive an internal `data-plain-file-path` property and an empty URL. The `a` renderer turns only these annotations into `md-file-link` buttons. It does not admit a custom URL scheme or change ReactMarkdown's URL sanitization. Existing external links still use the existing `Link` component or `onOpenLink` behavior.

Before creating a plain-path button, `resolvePlainWorkspacePath` strips a trailing line/column suffix, normalizes dot segments in the absolute workspace and target, and requires a non-root target strictly under that workspace. Missing or relative workspace context, traversal escapes and sibling-prefix paths remain text. This containment applies only to the new prose route; the existing code-span resolver is unchanged.

The recognizer intentionally accepts conservative POSIX-style paths with slash-separated ASCII word, dot, dash and `@` segments. Sentence periods remain outside the button, and multiple paths preserve their order. A line/column suffix remains visible but does not add line selection. No filesystem existence, symlink canonicalization, context-menu expansion or complete reference-regex equivalence is claimed.

## Retained Conductor evidence

The [asset manifest](../frontend/tauri-assets-manifest.json) records these decoded Conductor 0.87.6 assets:

- `renderApp-D_fmY7hW.js`, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- `index-BGEQ8YjU.js`, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

The integrating workspace/chat owner supplied the following static byte-offset trace from its rehashed retained bundles. This implementation Session checked the manifest identities and existing evidence notes; it does not retain those complete bundles and did not independently rehash or execute them.

- Renderer `ROo` at byte 8,870,027 routes assistant text through `xS` to `pEi` at 6,548,725, injecting `cEi`.
- `dHn` at 6,548,274 uses `BXs`, including `SXs = [wXs, xXs, Rzs]`. `xXs` at 6,536,881 visits text outside links, finds path candidates and emits `conductor-file://` links. The exact reference regex was not copied from the owner's abbreviated excerpt.
- `cEi` at 6,541,795 resolves with `RX` and uses the `IXs` file button at 6,540,107.
- `RX` imports index export `fA`, which maps to `WGt`. Its definition at 824,321 uses `_ne` at 823,036, `aKe` at 822,816, and `Ud`/`wne` for normalization and containment. The export map is at 3,483,304. The supplied trace rejects schemes, empty-relative workspace roots and outside-workspace targets.

[The original chat evidence](README.md) retains REA identity `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. REA parsed the index but skipped the full renderer after worker heap exhaustion. Renderer facts use the recorded manual decoded-bundle fallback, not original source or a successful full-renderer semantic analysis. [Existing REA gaps 1–3](rea-gaps.md) remain applicable. No new REA invocation, artifact acquisition or reference runtime observation occurred for this change.

## Verification

The new cases in `src/features/chat/markdown.test.ts` cover plain-path SSR markup, the actual rendered button callback using the existing `react-test-renderer` dependency, punctuation and multiple targets, normalized containment, absent workspace context, explicit links with nested labels, URLs, existing code spans, code fences and custom external-link components. Existing assertions are preserved.

The requested failing-before command was attempted before changing production code:

```bash
NODE_OPTIONS=--max-old-space-size=512 nice -n 15 node --test --test-concurrency=1 src/features/chat/markdown.test.ts
```

It failed before executing assertions because package `react` is absent. There is no local `node_modules`. This is a dependency failure, **not regression RED**. No install or retry followed. Local SSR/callback RED and GREEN are **NOT RUN**; automatic CI must execute the prepared cases and typecheck. A passing future run would establish the tested inputs only, not a historical baseline failure.

`git diff --check`, `node --check src/features/chat/markdown.ts` and `node --check src/features/chat/markdown.test.ts` passed. These check whitespace and parseability, not TypeScript types or behavior.

No app, browser, native/provider process, local build, manual workflow dispatch or rerun was started. There is no screenshot or recording because application/browser/native execution is outside this slice. Mounted interaction, native/macOS parity, real-provider behavior, filesystem alias containment and current installed-app identity remain unverified.
