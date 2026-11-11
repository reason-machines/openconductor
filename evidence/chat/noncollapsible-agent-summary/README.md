# Noncollapsible Agent summary headers

Conductor Rebuild omits the aggregate summary button while a turn is running or `dontCollapseToolCalls` is true. Its children remain inline. Finished normal turns keep their existing collapsed summary and toggle behavior. `expandToolsByDefault` still controls individual tool bodies independently.

## Source and isolation

- Clean main base `e92b5dd8f6e0655766d4360e8b24c255907a3a42` contains the shared port fix `762b59e52ba8c942bb01bf0875a4099f32114154`.
- Assigned branch `reason/openconductor-omit-nonco-8e693aec` targets main, not another PR branch. No reads or writes of PR #847 or #859 occurred.
- Sole writer `8e693aec-e47b-440b-825f-0796c2b59c8b` notified ledger owner `ddfc6518-d50f-46a6-b83c-c3a18aa07e43` before edits. The prior preparer released Agent work and sent its bounded probe as ordinary Session messages. No other Session checkout or dependencies were read.
- The baseline Transcript SHA-256 is `327c8cf638d06cee797b752e6c771bdbacad5138a044737fa8c4ac04a8f0d694`, Git blob `9163a4911851590e10efc886779c21178f08566b`. It is identical to the preparer's pinned main source.
- The production diff changes only `Transcript` summary context, the `RowContext` interface and `Agent`. All other top-level statements remain byte-identical, including `Row`, `TurnFooter`, `SignInNotice`, `TurnMenu`, `SummaryRow`, `Part`, `ThinkingRow` and copy actions. There are no helper, framework, backend, provider, status, manifest or dependency changes.

[The boundary verifier](verify.mjs) checks those statements and the retained reference. [Its result](verification.json) records the source hashes.

## Retained Conductor evidence

[reference.json](reference.json) is the original 8,497-byte attachment, SHA-256 `bd18e27c9678ffcb4e4bc3c38630a47c8196a2e6f884ee3244938b6b40ee2732`. Its five static slices retain their original byte offsets, UTF-16 offsets and hashes. This Session verified all five slice hashes and lengths. The parent independently checked their exact bytes against the retained full renderer.

The renderer is `/assets/renderApp-D_fmY7hW.js`, 11,600,457 decoded UTF-8 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, listed in [the frontend manifest](../../frontend/tauri-assets-manifest.json).

The static reachability chain is:

1. `UDo` combines last-turn identity with the active session status and passes `isNotComplete` to `MDo`.
2. `MDo` derives `G` from `!garry_mode && !isNotComplete && hasSummary`, where `FDo` identifies a summary.
3. `LDo` preserves summaries as dispatch variants.
4. For a summary, `ue` returns `de(collapsedMessages)` immediately when `!G`. That bypasses the `PDo` summary header. When `G` is true, it renders `PDo` and the children only when expanded.
5. OpenConductor's existing `WorkspaceView` passes `garryMode` into `dontCollapseToolCalls`. The fix uses that controlling prop, not `expandToolsByDefault`.

This is retained static real-app code, not runtime observation. The original REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` skipped the renderer under heap exhaustion, recorded in [the existing REA gap report](../rea-gaps.md). No new extraction, reference search or REA execution occurred. Extracted text was treated only as evidence and was not executed.

## Regression before the fix

The failing regression was committed before production edits as `5e285f4b53662896fdfd8bfe05966714ff9e1d0d`.

```bash
node --test --test-concurrency=1 src/features/chat/transcriptAgentSummary.test.ts
```

[before.tap](before.tap) records exit 1, 19 tests, 13 passed, 6 failed, none skipped. Each failure is the summary-header count, not a loader failure:

- Running/default, finished/dontCollapse and both flags each rendered one header instead of none.
- An earlier completed turn plus the latest running turn rendered two headers instead of one. The earlier header remained collapsed and only running tools were inline.
- `expandToolsByDefault` combined separately with running and dontCollapse each rendered one header instead of none. All three tool leaves received `open=true`.

All six cases passed their preceding tool-inclusion and final-text assertions. The thirteen preservation cases included normal collapsed, expanded and re-collapsed summaries, no-summary turns, short batches, the separate expansion preference, and three calls in one assistant message.

## Same regression and adjacent tests after the fix

```bash
node --test --test-concurrency=1 \
  src/features/chat/transcriptAgentSummary.test.ts \
  src/features/chat/toolGroups.test.ts \
  src/features/chat/view.test.ts \
  src/features/chat/reducer.test.ts \
  src/features/chat/turnTime.test.ts \
  src/features/chat/turnMenu.test.ts \
  src/features/chat/agentSignIn.test.ts \
  src/features/chat/permissionPrompts.test.ts \
  src/features/chat/conductorTools.test.ts \
  src/features/chat/thinkingChip.test.ts
node evidence/chat/noncollapsible-agent-summary/verify.mjs
git diff --check
```

[after.tap](after.tap) records exit 0, all 102 tests passed, none failed or skipped. The same 19 render cases and 83 adjacent source tests ran together once. The boundary/reference verifier and whitespace check also passed. The new regression is discovered by the existing automatic CI command `node --test "src/**/*.test.ts"` without manifest edits.

## What the render tests exercise

The TypeScript AST selects exact production statements `Transcript`, `rowTurn`, `groupTurns`, `Row`, `Agent`, `SummaryRow`, `Part` and `opensByDefault`. The reducer and complete pure view/grouping/time/tool modules are imported normally. Genuine React server rendering executes production `Transcript` through `Row`, `Agent` and `SummaryRow` with real hooks and its own real `RowContext`. No replacement visibility predicate or invented context is used.

For normal expansion and collapse, a test wrapper visits the actual JSX returned by production `Transcript`, `Row` and `Agent`, then invokes the actual summary `onToggle` closure during React server rendering. React's real state updater re-renders the wrapper. This checks unmounted state and markup, not DOM clicks.

Leaf isolation is explicit. `TurnFooter` and `MessageActions` return null. Icons emit markers. Markdown emits received text and class names. `ConductorToolRow` emits received tool name and `open` props. Thinking/link/report/backend branches throw if reached. Consequently final-text presence, preview-class propagation and individual-tool expansion props are checked, but real Markdown formatting and tool bodies are not.

The Reason cloud run used only isolated React 18.3.1, React DOM 18.3.1 and TypeScript 5.9.3 prerequisites, six packages total, installed with `--ignore-scripts --no-audit --no-package-lock`. No heavy install or local app build ran.

Mounted/browser/native checks, screenshots, CSS appearance, actual click behavior, app runtime, packaging and local full typecheck/build were NOT RUN. Runtime admission was explicitly excluded. Normal automatic CI owns full typecheck/build coverage; packaging owners must establish any later artifact containment. Merged, packaged and observed-working are separate states.
