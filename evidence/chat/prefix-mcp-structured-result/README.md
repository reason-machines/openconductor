# Linear / Context7 structured transcript results

Author: Conductor Rebuild. Scope: `CHAT.PREFIX-MCP-STRUCTURED-RESULT`, cleared by the existing ledger owner. Source-only follow-on after #1407; no new runtime or native acquisition.

## Qualified defect

Fresh default main `eef01e9b287472280fb3f4a585bc697d5f1f8f51` preserved the raw result through the adapter, reducer and row view, but the `MoreRows` `linear-mcp` / `context7-mcp` branch passed only flattened `result` to `McpRow`. Generic MCP and Node rows already selected the raw value. The defect is in this prefix-specific presentation boundary, not the provider or shared formatter.

The retained Conductor renderer's complete `Bki` and `$ki` declarations pass the original tool result to `V9e` and `iUt`. The registry and name-prefix dispatch join those consumers to Linear and Context7 calls. `V9e` keeps strings verbatim, formats truthy structured content as pretty JSON and omits falsy result content. `iUt` derives its error chip from the same original content, using compact JSON for nonstrings. The complete declarations and exact UTF-8 half-open offsets are in [source.json](source.json).

The whole retained renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Eight full declaration ranges were checked against those bytes. Historical REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` skipped renderer semantic analysis under heap exhaustion. This is retained-byte source qualification, not a new successful REA semantic pass or a native behavior observation. No new REA invocation or failure occurred; the [existing gaps](../rea-gaps.md) remain open.

## Frozen RED before the product edit

```bash
node --test src/features/chat/prefixMcpStructuredResult.test.ts
```

At the fresh main source above, this ran **18 cases: 6 passed, 12 intended assertion failures, 0 skipped/cancelled**. The adapter, reducer, view and production row mounted successfully. The twelve failures showed lost resource metadata, overwritten raw strings, omitted empty structured arrays, flattened content resurrected despite explicit null, and lost structured errors. Six passing controls preserve generic MCP, Node, pending and legacy-error behavior.

[freeze.json](freeze.json) pins the final-location fixture SHA-256 `f4aa6a18b5f959d945011d70f9206a02f5802127c45b4e537950fa3daccec371`, baseline ToolRows digest and both existing generic16 files. The raw output is losslessly retained as [red.tap.gz](red.tap.gz). A scratch version originally expected the unrelated generic chip to include a nonexistent `query:` prefix. Its control expectation was corrected from current `genericSummary` source before freezing; the final-location baseline above is the qualifying RED. The scratch-to-final migration changed relative import/locator paths only, not any scenario or assertion body.

## Smallest complete repair

Only `ToolRows.tsx` changes in production:

- The two prefix consumers forward their existing `rawResult` to `McpRow`.
- `McpRow` uses a supplied raw value ahead of legacy `result`, distinguishing undefined legacy provenance from explicit null. Strings remain verbatim; structured display output uses pretty JSON; the error chip uses compact JSON. Existing truthiness/disclosure and 100,000-character limits remain in place.
- Existing callers without the new optional value retain their prior string behavior. No changes to `InputOutput`, shared helpers, backend mapping, provider execution, styles, labels, other row arms or existing generic16 fixtures.

This keeps invariant ownership at the row boundary without introducing another state store or transport representation: simple internals, strict boundaries, isolated volatility.

## GREEN and preservation checks

Executed serially on this Session's Reason Cloud computer:

```bash
node --test src/features/chat/prefixMcpStructuredResult.test.ts
node --test src/features/chat/{prefixMcpStructuredResult,genericStructuredResult,reviewToolStructuredResult,conductorTools,reason,reducer,view,persist,typedSubagentErrorResult,toolErrorRetry}.test.ts
npm run typecheck
npm run build
python3 evidence/chat/prefix-mcp-structured-result/verify-source.py --renderer .ara-state/tmp/chat-next-gap/renderApp-D_fmY7hW.js
git diff --check
```

- **Passed:** unchanged 18-case fixture, 18/18, no skips/cancellations.
- **Passed:** 160 adjacent tests, no failures/skips/cancellations.
- **Passed:** whole-app TypeScript typecheck and production build. Build retains existing chunk-size advisory warnings.
- **Passed:** retained full renderer, eight exact source records, frozen fixture and both unchanged generic16 digests.
- **Passed:** whitespace/diff hygiene.

Compressed complete outputs are kept alongside this note. The fixture enters the existing automatic frontend test glob. It uses the real adapter/reducer/view and mounts the production row; unrelated native/link/Markdown edges are throwing stubs. It does not execute the vendor renderer as an oracle.

## Explicit limits

No browser, app/server, native/provider execution, package dispatch, installation, cloud Claude/Codex or watcher was started. No screenshot is supplied because browser/native observation is excluded from this lane. Mounted assertions prove this presentation boundary's content and disclosure transitions, not browser pixels, native interaction, full-app side-by-side parity or real-provider compatibility. Installed identity, containing-package inclusion and native acceptance remain with existing release/E1 owners, unverified here. Manual-only CI jobs remain not run rather than passed; exact-head hosted results and merge state are reported separately on the delivery PR.
