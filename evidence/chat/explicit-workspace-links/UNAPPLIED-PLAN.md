# Explicit workspace hrefs — unapplied source plan

Conductor Rebuild. Checked default: `750b8bf25b2193141eff0cfcad64776228bea076`.

Status: source-collision cleared by the existing ledger owner. Root coordinator confirmed the bounded path-navigation scope, unchanged callback API/ReasonPath origin semantics, and explicit line/file-menu/native/special-URI gaps. New fixture source and unapplied prospective treatment are prepared; no runtime admission, product patch, commit or publication.

## Proven chain

Retained real-app extraction `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` supplies both complete hashed assets. The existing data-only qualification script verifies the normal `ROo -> xS -> pEi -> cEi -> RX=WGt -> IXs` chain. Current main supplies cwd and file callback through `WorkspaceView.ChatPanel -> Transcript.Part -> Markdown`, but ordinary explicit anchors skip workspace resolution and use `LinkWithMenu` / the external opener.

This is distinct from #1486's typed-result prop forwarding. The no-callback generated-file-button hypothesis is dropped, not combined into this unit. Thinking forwarding matched the reference and is not a defect.

## Reference href decision order (source, not executed behavior)

1. `cEi` immediately returns children for an absent href.
2. It computes `RX(workspacePath, href)` only when the file callback and workspace path both exist.
3. `_ne` first strips raw query/fragment via `lKe`. It recognizes `conductor-file-code://`, `conductor-file://`, and `file://` specially. Otherwise fragment-only and protocol-relative hrefs are excluded. Remaining paths are decoded with `decodeURIComponent`; failure retains the original bytes.
4. `aKe` parses terminal `:line` or `:line:column`; it retains the line number only. The column is not forwarded.
5. `WGt` rejects a decoded URL scheme, resolves the candidate against the workspace using the shipped path implementation, requires containment and rejects the workspace root itself.
6. `cEi` handles its app-internal links and fragment-only anchors before the ordinary resolved-file branch. Those app behaviors are not to be fabricated in this increment.
7. With callback and accepted resolved target, `IXs` creates the navigation control and calls the callback with `{path: relativePath, lineNumber}`. The supplied `pEi` callback calls `navigateToFile` in edit mode. `EQ` supplies file-copy/Finder menu behavior around the button.
8. If resolution is unavailable or rejected, `EXs` treats scheme-less, non-protocol-relative hrefs and the two synthetic conductor-file schemes as file-shaped and renders an inert span, retaining the separate file menu. Other hrefs use the external opener wrapper.

## Confirmed bounded implementation plan

Implement explicit **scheme-less** workspace href navigation at Markdown's existing anchor boundary. Preserve the existing absolute-path-only callback contract for this bounded increment, preserving its current path-suffix stripping; do not call its second parameter with a line number. State line selection as unimplemented relative to the reference rather than calling it parity.

Keep ReactMarkdown's current URL-transform allowlist untouched. Do not admit `file://`, synthetic conductor-file schemes, app links or other schemes by adding a protocol allowlist. Existing sanitized-scheme behavior remains unchanged and is a known reference-coverage gap, not a new claimed capability.

Avoid applying the prose/code `looksLikePath` heuristic to explicit hrefs: `README.md` is an ordinary explicit relative target in `WGt` even though the prose recognizer will not autolink it. Instead separate generic lexical containment from path recognition **inside the same owning module**, keep the existing public code/prose resolver as a wrapper with identical guards, and have the explicit-href classifier use the common containment owner.

For explicit scheme-less file targets, raw/decoded schemes, origin-like `//`, backslashes and controls must not be admitted as local navigation. Strip query/fragment in the reference order and decode once only; malformed escapes must not throw. Never use browser URL origins or the current working directory as a substitute for the supplied absolute workspace. Reject normalized root and sibling-prefix/traversal escapes. A path-shaped string alone does not establish a navigation capability: require the actual current callback and absolute workspace too.

Preserve the existing custom Link/menu surface for accepted explicit hrefs by adapting its click port to the resolved file callback, rather than silently discarding its Copy link address menu. Default anchors must intercept navigation into the file callback. Rejected or missing-capability hrefs also retain their current raw-address copy menu: the proposed LinkMenu extension adds an optional inert-render port (`disabled`) so its existing menu wraps a span instead of a navigable anchor. The existing ledger owner source-collision cleared this additional writer exclusively to this same BE7 unit; final implementation review and a new serialized grant are still required. This is navigation parity only: retaining OpenConductor's existing raw-address menu is **not** the reference's Copy file path/Finder menu parity. No new native/Finder behavior is proposed.

Rejected or missing-capability explicit file hrefs must not be sent to an external opener as a fallback. The retained source's `EXs` branch is inert. This rule is limited to explicit hrefs; existing generated prose/code buttons and their absence-of-callback behavior remain unchanged.

## Line number / origin API boundary

Reference `WGt -> IXs -> pEi` carries optional lineNumber to navigation. Current `MarkdownOptions.onOpenFile` takes `(path: string)`. Current `Transcript.onOpenFile` takes `(path: string, target?: ReasonPath)`, where the second argument is provenance, not a line number. Current ChatPanel strips cwd for a local path and forwards the target. Current `openFileOrViewer` consumes the target's cloud identity before local dispatch and calls `openAnyFile(path)` without a line.

Do not overload that provenance argument or append an ambiguous `:line` suffix to a filesystem path. Full reference line selection would require a separately explicit extension of this callback chain outside the currently collision-cleared three-path unit. The recommended bounded delivery leaves that gap explicit. No origin/transport/provider/WorkspaceView change is implicitly authorized by a Markdown href parser.

## Proposed new regression (not written or run)

Load actual production Markdown and the full existing LinkMenu with real React hooks. Only menu portal, clipboard and external host boundaries use adapters. Normal parser/remark plugins, canonical containment and real click callbacks stay production code. Do not copy a resolver into the test.

Observe file callback arguments and zero external-opener dispatch, not a prescribed host-element implementation. Cover ordinary relative and dot-relative hrefs, absolute contained hrefs, a single-name file, a reference-definition link, preserved formatted label, encoded path, query/fragment behavior, normalized contained segments and callback/workspace replacement. For suffixes, the confirmed bounded contract asserts the stripped path and no invented second callback argument; no line-selection claim is made using these path-only assertions.

Controls preserve external HTTP(S) including same-looking path suffixes, mailto/other allowed schemes, fragment-only and protocol-relative hrefs, rejected root/outside/sibling-prefix/traversal paths, encoded schemes/authority/traversal, missing cwd/callback, malformed escapes, unchanged current special-scheme sanitization, ordinary code/prose/fences, and the actual custom-menu copy callback. File callback origin and missing-provenance boundaries must remain explicit; a local success must not be called cloud-origin verification.

The exact frozen source fixture must produce semantic RED through intended assertions before any product patch is applied. Only separately admitted unchanged GREEN, permanent evidence and hosted exact-head CI can support delivery. Prepared fixture includes 20 top-level tests: thirteen positive href cases and seven lifecycle/boundary/control groups. These counts describe source cases, not executed results.

## Scope and custody

Collision-cleared paths: existing `src/features/chat/markdown.ts` anchor/resolver hunk only; new `src/features/chat/explicitWorkspaceLinks.test.ts`; new `evidence/chat/explicit-workspace-links/` evidence. Additional writer source-collision cleared: `src/features/chat/LinkMenu.tsx`, only the optional inert-render port preserving the exact existing menu/copy body. Its treatment remains unapplied pending final source review and a separate serialized runtime grant. No Transcript, WorkspaceView, reducer, provider, native or URL-transform mutation is assumed.

Preserve typed14, plan11, existing markdown tests and complete source controls. Existing ten dependency identities, runtime receipts and artifacts remain protected. No package installation, Node probe, transpilation, typecheck, build, server, browser, native dispatch, provider retry or new reservation is admitted. The existing queue owner alone grants a bounded runtime slot.

Native owner remains provider-blocked with an explicit do-not-retry result. #1482/#1486 installed containment and native behavior remain unverified under the already scheduled status-only follow-up; this source plan adds no native work.
