# Terminal cursor-state source qualification

Conductor Rebuild / SAME1f. Read-only lead, not a product patch or a native/visual acceptance result.

## Supported finding

Fresh main `385ccb5229f56ff33903f034352eaa9827c40f0e` lacks the cursor-theme lifecycle projection in the retained reference renderer. In the source counterexample, a terminal has been focused while running, its xterm cursor was initialized, and the shell has not independently hidden it. A later exit event disables stdin but leaves OpenConductor's cursor theme unchanged. The reference's corresponding snapshot makes `showCursor` false and assigns a transparent cursor theme.

This proves a source-level theme-option divergence. It does not prove a visible cursor exists after every exit, that real shell output leaves cursor modes unchanged, or that either installed app was observed. No browser, renderer, product test, native app, PTY, provider or build ran for this lead.

## Reference identity and complete source chain

Original held REA evidence: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. Attachment `bfa06ee0-799f-47fe-9edc-73997c70a340`, archive SHA-256 `d0d8e4b9b20c5150f30f5edff149bfc25f3074da5a1a66357b1caaf1ef0033ab`. The manifest records both complete original asset hashes and 22 exact UTF-8 byte spans. Reference source is inert untrusted data, never evaluated.

1. `ts=DAt()` constructs the `$kt` runtime. Its `createSession` registers a `V9`, whose snapshot begins with input disabled, enables it after backend readiness, and disables it on exit or failed spawn. `$kt.getSession` returns that snapshot.
2. Index `LAt` calls `ts.getSession(bI(surfaceId))`; `bI` resolves the current local/handoff runtime identity. Index exports `LAt as gn`, imported in the renderer as `U4e`. `G5e` calls that same selector and subscribes to the matching session/handoff change event.
3. Complete renderer `eSa` reads `G5e({terminalId:surfaceId})`, computes `d=snapshot?.isInputEnabled ?? true` and unavailable predicate `_`, then passes `showCursor=d&&!_` to `w9e`. The missing-snapshot default is true; the finding concerns an existing registered terminal that has exited, not an unregistered startup frame.
4. `w9e` passes the same option through `dno → uno → cno → lno` on creation, and to renderer-local `$At` on updates. It also preserves the option during theme refresh. This `$At` is not index's unrelated destroy-session function.
5. `lno` gives xterm `theme:IJe({showCursor})`. `$At` detects a change in `showCursor` and replaces `terminal.options.theme` using that same helper. `dno` also refreshes it on a warm attach.
6. Complete `IJe`, renderer bytes `[3139253,3140055)`, uses `cursor: showCursor===false ? "transparent" : foreground` and `cursorAccent: background`. Its complete declaration was retained between unique `function IJe(` and `function t9s(` anchors and read in full. This is bounded named extraction, not a new AST proof. The earlier whole-module Babel 60-second timeout is carried forward, not retried or hidden.

The complete retained `Jwa` predicate is `isWorkspaceUnavailable && runtimeConnectionState !== "running"`. For the available local terminal in this counterexample, that predicate is false. Its declaration is included and byte-verified; no cloud or archiving UI is proposed.

## Fresh-main counterpart and the dependency boundary

The retained main blobs include `session.ts`, `TerminalPanel.tsx`, spawn-error CSS, global terminal CSS and package manifests.

- `session.ts:startTab` constructs xterm with `cursorBlink:true`. Its theme sets background, foreground and selection colors but has no cursor/cursorAccent fields. `route` enables/disables stdin on ready/exit; failure disables stdin. None updates the cursor theme. `attachTab` focuses the same terminal unless quiet focus preservation applies.
- `TerminalHost` continues to mount the xterm on exit. The retained CSS has no exit-dependent cursor-hiding rule. Its status-driven overlays do not close the exited-terminal counterexample.
- The unchanged main lockfile pins `@xterm/xterm` 6.0.0. The already-existing dependency also identifies itself as 6.0.0. No dependency was installed, warmed or executed.
- In that dependency, `CoreBrowserTerminal` maps `disableStdin` to `textarea.readOnly`. Its textarea focus handler initializes the cursor through `_showCursor`. `CoreService` guards input events when stdin is disabled but does not hide the cursor.
- `ThemeService` uses an opaque default cursor when `theme.cursor` is absent. `DomRendererRowFactory` admits a cursor when core cursor visibility and initialization allow it; the decision does not consult `disableStdin`. `DomRenderer` uses the resolved cursor color for block/bar/underline/outline styles. The source counterexample assumes initialized cursor visibility; it does not assume shell control sequences cannot change that visibility.

These package source reads establish the local pinned dependency's mechanism. They are not an integrity claim about Conductor's bundled xterm version, a render run, an installed-build observation, or a universal visible-cursor assertion. The reference claim stops at its explicit theme assignment.

## Minimal candidate scope and isolated regression design

This is a proposed scope for ledger collision qualification, not a code change:

- Only `src/features/terminal/session.ts` theme construction and lifecycle cursor-theme assignments; preserve the existing status source of truth, stdin admission, input metadata, clearTab/formfeed, tabs, persistence, PTY queue/native code, scripts, managed environment and resource labels.
- New `src/features/terminal/cursorState.test.ts` executing the production session module with external PTY/xterm/DOM/preferences/storage boundaries isolated, following the existing tests. Freeze the same fixture before any implementation. Assert transparent cursor initially/after exit/error, foreground cursor on ready, retry until ready, sibling isolation, and unchanged unrelated theme fields/input metadata. Do not simulate observed shell redraw or native visibility.
- New isolated `evidence/terminal/cursor-state-1f/` only if the scope is qualified. This scratch report remains untracked and is not added to #1014.

No test fixture, product file, commit or PR was created for this lead. Tests/typecheck and any runtime remain subject to the existing sole executor's serialized admission. Native PTY allocation/reuse and actual shell redraw remain separately parked and are not relabelled as a source defect.

## Source-byte check performed

`python3 .oc-tmp/cursor-state-1f/prepare.py` passed on this Session's Reason Cloud computer, 2026-11-11 at 07:52 UTC: two complete retained assets rehashed; all 22 spans matched full original bytes; six immutable current-main blobs retained; seven existing dependency files identified by hash. Manifest SHA-256: `f4c06d5c5ef65f4183a18fe7b70efc864ff7f54c4b047705de43860d3ac560f9`.

`git diff --check` passed. Tracked product/test/evidence diff remains unchanged; only scratch content was added. No new acquisition, parser run, dependency install, test execution, browser, native app, provider action, observer or workflow dispatch occurred.
