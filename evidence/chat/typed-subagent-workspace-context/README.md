# Typed-subagent formatted-result workspace context

Conductor Rebuild forwards the existing `workspacePath` and `onOpenFile` through three sites in `ToolRows.tsx`: the typed-subagent dispatch, the explicit `SubagentRow` props/destructure, and its existing Formatted `Markdown`. Destructuring removes both props before the `...shell` rest object reaches `RowShell`. Raw text, result selection, copy, disclosure, path parsing/resolution, external opening and the link menu are unchanged. No shared renderer, native opener or provider code changes.

## Reference and source binding

[Retained REA source](source.json) records real-app extraction receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`, the complete original asset identities and exact attributed spans. The normal Task/Agent registry reaches `bpo`; its Formatted branch passes the current workspace identity/path to `xS -> pEi -> cEi`. The common Markdown pipeline supplies recognized file buttons and the workspace navigation callback. Its Raw branch is plain text. The earlier REA semantic pass exhausted its heap and skipped this renderer; this evidence is retained extracted shipped source, not a new semantic/native observation.

[Source-only treatment binding](treatment-binding.json) checked fetched main `735db18c9141cb409b26d142b8d0a305edaf91c8`. All fifteen relevant current-main context files match the frozen RED inputs. Exactly the three substitutions in [the previously frozen patch](treatment.patch), SHA-256 `03e6f0ae156f6e1e50221e5929205f15651f1e1f52e2d0e60e1c3770cd06f5e5`, produce the candidate. Reversing those substitutions recovers the main `ToolRows.tsx` bytes exactly. The merged plan-menu line from #1482 stays intact; it is historical, not part of this product diff.

The permanent `src/features/chat/typedSubagentWorkspaceContext.test.ts` is byte-identical to the frozen fourteen-case fixture: SHA-256 `e6c4da93039470df8a676b0bbd0a8947b15d0803bea0468a486330f61da04049`. No assertion, case, import, adapter or oracle was rewritten. Historical UNRUN labels in `source.json` and [the immutable RED request](red-request.json) describe preparation, not the later execution below.

## Actual RED reproduction

The sole admitted RED executed once on Reason Cloud:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s \
  env NODE_OPTIONS=--max-old-space-size=768 \
  node --test --test-concurrency=1 src/features/chat/typedSubagentWorkspaceContext.test.ts
```

[Actual receipt](red-result.json) and [raw TAP](red-output.tap): start gate `2026-11-18T02:06:10.721567Z`, test end `02:06:16.736847Z`, actual release `02:06:16.959050Z`; exit 1, seven intended `TYPED_SUBAGENT_MUST_FORWARD_WORKSPACE_FILE_CONTEXT` assertion failures and seven passing controls, with no setup error, timeout, cancellation, skip or todo. Every target found zero matching file buttons instead of one.

The seven failing targets were Task relative inline-code path, Agent dot-relative line/column path, Task plain-text path, Agent absolute contained path, structured-result selection rather than flattened fallback, workspace/callback replacement, and returning from Raw then collapsing/reopening. RED stopped each before file-callback invocation. In particular, the replacement case did not reach its second workspace/callback destination; that remains a GREEN requirement, not a RED observation.

The seven passing controls covered lexical-negative inputs, missing workspace, missing callback, exact Raw/result-copy text, external opening plus Copy link address, untyped subagent and generic subagent. These passing controls invoked production tab/disclosure, copy, external-link and menu callbacks through adapters. Negative controls alone do not establish post-treatment path confinement. The copy reset timer was recorded, not fired.

All eleven runtime inputs and ten dependency identities passed before/after; fifteen current-main context pins passed. The child was reaped with zero owned-group survivors, without TERM/KILL. CPU0, nice10 and UV1 were used inside the 95-second foreground / 60-second workload + 5-second kill grace + 30-second cleanup envelope. 768 MiB is a per-Node heap bound, not a measured or capped process-group RSS. Minimum sampled free disk was 5,782,642,688 bytes; output was 10,413 bytes. Numeric process-group identity was not recorded in the RED receipt.

## Actual GREEN verification

The same command and byte-identical fourteen-case fixture ran once after the three-site treatment under admission `TYPED-SUBAGENT-CONTEXT-BE7-GREEN-20261118T022942547Z`. [Actual receipt](green-result.json) and [raw TAP](green-output.tap) record **14 passed, zero failed/cancelled/skipped/todo, exit 0**. The seven intended RED failures became passing targets; all seven controls remained passing. No fixture, oracle, adapter, import or case was changed.

The metadata timestamp was `2026-11-18T02:30:55.245014Z`, with expiry exactly 125 seconds later. Start gate was `02:30:55.767701Z`; the test ran `02:30:56.249211Z` to `02:31:04.652947Z`, with actual release `02:31:05.049053Z`. Owned process group 139 was reaped with zero survivors or other owned workloads; no TERM/KILL or resource stop was needed. CPU0, nice10, UV1 and the unchanged 95-second foreground / 60+5+30-second envelope applied. Minimum sampled free disk was 6,582,894,592 bytes; output was 3,322 bytes, SHA-256 `aacae2e3e9289bcec16f850b1d628a0314753573364493487e15b362610543ea`. RSS was not measured; heap768 is a per-Node bound, not a group RSS cap.

[Execution binding](green-execution-binding.json) records fresh main `590e58910884998e242cafb037f53286d4c7fb45`. All fifteen context bindings, eleven runtime inputs, ten dependency identities, RED evidence, original requests/supervisors, candidate and committed-source pins passed before/after. The [original GREEN request](green-request.json) and [unchanged supervisor](green_phase.py) are archived without rewriting their historical main/commit identities. After execution, main was merged normally and the product/fixture hashes stayed unchanged.

- **Passed, source only:** 81 preparation checks, exact three-site patch/reversal, permanent-fixture identity and whitespace validation.
- **Passed, behavioral:** the identical admitted RED/GREEN command changed seven target failures/seven passing controls to fourteen passing cases. Both runs passed the fixture's transpile diagnostics for complete production row and link-menu modules; this is not a full typecheck.
- **Pending hosted CI:** mandatory frontend CI discovers the permanent regression via `node --test "src/**/*.test.ts"` and runs adjacent suites, full typecheck and build. No extra local Node, transpilation, install, typecheck or build ran outside the admitted GREEN.
- **Not run:** browser, native or provider execution.

## Coverage boundaries

The fixture starts at production `ConductorToolRow` and executes `Row -> MoreRows -> SubagentRow`, complete production link-menu code, real React state and the unchanged Markdown/remark pipeline. GREEN invoked actual file-button closures and verified exact absolute-path callback payloads: the four path variants and structured result, both first and replacement workspace/callback destinations, and the restored Formatted result after Raw/collapse/reopen. It also invoked production tab/disclosure, result-copy, external-link, context-menu and Copy link address closures through adapted boundaries. Clipboard/backend adapter calls are observed; the copy-reset timer is recorded but not fired. Root producer/transport/WorkspaceView integration is source-linked, not mounted here. There is no two-row simultaneous-isolation case.

Menu portal, clipboard/backend host boundaries and icon presentation are adapted. No real DOM/mouse dispatch, OS clipboard, filesystem or symlink confinement, native-file opening, Finder, line selection, file-URI expansion, visual parity, installed package or deployed-build containment is proven. No screenshot/recording is attached: browser/native/package verification remains with the existing sole native owner; this unit does not dispatch duplicate native work.
