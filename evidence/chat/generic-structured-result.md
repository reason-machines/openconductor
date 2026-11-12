# Generic structured tool results

Conductor Rebuild owns `CHAT.GENERIC-NONMCP-STRUCTURED-RESULT`.

## Qualified source and cause

Fetched default main `85194324762be7c00ba8d092c4e00bdb564f1ac4` matches all seventeen relevant source snapshots sealed against `869d6efad0cdeb6a889538978f3e6416f0e3a2c2`. The sealed archive SHA-256 is `221557598e75277ac575920ba94f4b4245d702ac08277c5ac516770244c5d8ee`. All 48 manifest files and 21 retained byte spans match. [Source identities and exact spans](generic-structured-result/source.json) retain the verification details without committing proprietary renderer assets.

The retained real Conductor 0.87.6 `aUt` passes the actual tool result to `V9e`. That formatter keeps strings unchanged, pretty-prints truthy nonstring content as complete JSON, and hides falsy content. `H9e` and `U9e` bound the displayed text to 100,000 characters. `aUt` offers disclosure when input or result content is present. `ToolSearch` and `Monitor` are real fallback consumers in the retained registry, caller and visibility joins.

Current native mapping preserves the original `tool_result.content` as `raw_result` while separately flattening text blocks into `output`. The wire, adapter, reducer, view, and Transcript retain that raw content. `Row` passes it into `MoreRows`, but the default `MoreRows` call drops it before `GenericRow`. A text-block array therefore displays only its flattened text instead of the original structured JSON.

The correction belongs at this dropped prop and its non-MCP consumer, not in transport, parsing, or shared rendering. The fix forwards `rawResult` only in the default arm and normalizes only non-MCP `GenericRow` display content. An absent raw value retains legacy `result` fallback. Supplied strings remain strings, including JSON-looking strings. Supplied zero, false, null, and empty strings remain hidden under the retained truthiness rule.

`InputOutput`, `McpRow`, Node REPL, specialized rows, the separate error gate, subagent fallback, `RowShell`, imports, styles, providers, backend, manifests, and lockfiles remain outside this change. Frozen #847 and #1098 and the terminal, image, and Thinking owners remain separate.

## Frozen mounted regression

The sealed sixteen-case test mounts production `ConductorToolRow` after the real `applyReasonPayload`, reducer, and view. Only unrelated Markdown and native dependencies are throwing stubs. It checks title, status, input JSON, output/error labels, disclosure absence or presence, and collapse, expand, close, and reopen behavior. It does not mount the complete Transcript parent or execute a native provider.

Frozen identities remain fixed across baseline and corrected execution.

```text
genericStructuredResult.test.ts    ff5d97c3480bc149c2e0d270bcfe04108add26b2521c9582a46775e2668d655a
genericStructuredResult.inputs.json d6af06d2d52d236942bac11425f043a7ec40727129c5eeb8899ba24e263987da
package-lock.json                  0714cb6ccdd0e8332f4ff08dc6b9ec0eb786e8f7b6b386663d31b9323579796a
```

## Executed product change

The standalone branch was rebased on fetched main `4b6bc34e93c4fa9ab3eaa042e855b77bd712a926` before execution. Both retained patch hunks still applied. The genuine baseline ran before either hunk changed product code. No module dependency or test-freeze migration was needed. The exact two-hunk fix changes only default forwarding and the non-MCP display content in `GenericRow`.

`ToolRowProps.rawResult?: unknown` owns the field type. `Row` forwards it to `MoreRows`, whose default arm now supplies it to the `GenericRow` parameter derived with `Pick<ToolRowProps, ...>`. The MCP branch still passes only legacy `result` into `McpRow`. This supplies the interface needed by the separate MCP follow-up without implementing that follow-up.

## Execution status

The following checks ran serially on Reason Cloud computer 313 under the existing ACC grant. [Commands, exit codes, hashes, and cleanup receipt](generic-structured-result/execution/run.json) retain the exact execution record.

- Baseline failed as intended: all sixteen cases executed, with seven behavioral assertion failures and nine passing controls, exit 1. [Raw baseline TAP](generic-structured-result/execution/red.tap).
- Corrected execution passed all sixteen unchanged cases, exit 0. [Raw corrected TAP](generic-structured-result/execution/green.tap). The test, inputs, and root lockfile hashes above are identical before and after.
- The four retained adjacent files passed all 53 cases, exit 0. [Raw adjacent TAP](generic-structured-result/execution/adjacent.tap).
- `timeout 180s node_modules/.bin/tsc --noEmit --incremental false` passed, exit 0, with no diagnostic output.
- The one lock-pinned `npm ci --ignore-scripts --no-audit --no-fund` restore passed. Dependencies used at most 458,048 KiB, below the 1 GiB incremental budget. No setup failure was counted as RED.

Own dependencies were removed after the checks. All commands were terminal and own jobs were empty at 15:55:50Z. The runtime slot was explicitly released before PR publication. Hosted checks, merge, and containing-artifact acceptance are separate from these local passes.

## REA and delivery limits

Reference evidence is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The original semantic renderer pass exhausted its heap and skipped the renderer. This task verifies retained shipped bytes and static caller joins, not a new successful semantic analysis. No new REA failure occurred. Fresh installed-original identity, real-provider emission, original-app side-by-side layout, native I/O, package inclusion, and release acceptance remain unverified.

No screenshot exists because this serialized grant excluded browser, server, and native execution. The mounted test proves rendered row content and disclosure transitions, not browser pixels or complete-app parity. Later containing-artifact proof stays with the existing release owner and E1 native verifier. No package cut, native executor, or provider session was created.

## Feature ledger status

`CHAT.GENERIC-NONMCP-STRUCTURED-RESULT` has passed mounted RED-to-GREEN, adjacent checks, and typecheck. Exact-head hosted checks and merge are pending publication. Native, provider, and package acceptance remain unverified. The canonical shared feature page is maintained by the existing ledger owner, separately from this checked-in receipt.
