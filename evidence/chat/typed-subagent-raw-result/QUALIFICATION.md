# Typed subagent raw-result qualification

Author: Conductor Rebuild. Contract: `CHAT.TYPED-SUBAGENT-RAW-RESULT`.

## Source-qualified contract

Fresh default main checked: `1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5` (actual merge of #1410). This qualification is independent of the untyped fallback repair in open #1418. Nothing from this packet was appended to #1418.

The full retained real Conductor renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Ten complete original-byte declarations/ranges passed hash and exact-text readback; source.json retains them. Registry dispatch selects bpo for Task, Agent and sub-agent. For a typed call, bpo enables disclosure using original toolResult.content truthiness, converts that original content with yZe, and supplies the converted string to Formatted Markdown, Raw and copy. yZe preserves strings, concatenates array text without inserting separators, takes object.text, and otherwise pretty-prints JSON. An empty array is truthy even when conversion returns an empty string. Null, false, zero and empty strings are falsy.

Current main preserves rawResult through the Reason adapter, reducer and buildRows, but the typed MoreRows dispatch passes only flattened result to SubagentRow. SubagentRow converts flattened result, then gates disclosure by converted text. This loses original strings/structured values, revives flattened output for intentionally falsy raw results, and suppresses the empty-array controls. Existing resultText already supports this accepted JSON-shape conversion contract and stays byte-identical.

## Smallest candidate

The candidate.patch changes only typed dispatch and SubagentRow in ToolRows.tsx:

- Forward existing optional rawResult.
- Select rawResult when defined, otherwise retain the legacy result path.
- Convert via existing resultText; use original selected content truthiness for disclosure.

No GenericRow, InputOutput, shared helper, Markdown, map, provider, backend, CSS or other row-arm changes. Simple internals, strict boundaries, isolated volatility.

## Final frozen regression

Final V3 fixture SHA-256: `dea7a1df1432b2b325944f1bd9243ac056ea59aec9e7be2a00ccd23e6107ae79`.

Forty-two cases enter actual applyReasonPayload, applyChatEvents and buildRows, then mount production ConductorToolRow, MoreRows, SubagentRow, RowShell, real Markdown, Raw and CopyIcon. Only clipboard and copy-confirmation timers are fake boundaries. Unrelated links/highlighting/native execution throws if reached. All Task/Agent/sub-agent names cover raw strings, text arrays, objects, empty arrays, null, false, zero, empty strings, true, matching text arrays, legacy success/failure and pending. Assertions exercise exact Markdown input, explicit formatted output, exact Raw/copy bytes, status/type/model/description, copy propagation and collapse/reopen preserving Raw.

On untouched pinned main, before applying the candidate for the final replay:

```bash
node --test .ara-state/tmp/typed-raw-audit/main/src/features/chat/typedSubagentRawResult.test.ts
```

**RED:** 42 executed, 15 passing controls, exactly 27 named content/disclosure assertion failures, zero skipped/cancelled, exit 1. No import or setup failure qualified as RED.

**GREEN:** same final V3 fixture, unchanged bytes, 42/42 passing, zero failures/skips/cancellations, exit 0.

**Adjacent PASS:** 219/219 across new42, unchanged typed16/links, prefix18, generic16, review results, conductorTools, Reason adapter, reducer, view, persistence and retry. Seven frozen controls and existing resultText/Markdown readbacks passed.

**Typecheck PASS:** whole archived app after restoring its three declared fixture inputs, using the unchanged tsconfig and installed dependencies. Initial scratch typecheck could not resolve those absent archive fixtures; both logs remain. No compiler or test rule was weakened.

## Corrections retained rather than hidden

- V1 combined-class selector treated multiple CSS classes as a single token. That baseline was disqualified, before any candidate edit; its freeze and raw log remain.
- V2 was 15 PASS/27 FAIL on baseline, then 39/42 on candidate: its three structured-object cases incorrectly expected literal JSON in Formatted, despite existing Markdown smart punctuation. No Markdown change was requested or made. V2 freeze/test/RED/GREEN/adjacent logs remain historical and are not called GREEN.
- Final V3 explicitly checks the exact Markdown input and expected existing formatted glyphs, separately from byte-exact Raw/copy. Untouched baseline was restored before final refreeze and RED. Only then was the same candidate replayed to unchanged 42/42. V3 is the delivery fixture; earlier freezes are not substituted for it.
- Initial adjacent scratch pass lacked tools/chat/lisbon.ts and the existing Claude usage fixture. Restoring those tracked inputs yielded the completed 219/219 pass; the earlier log remains in v2.

## Reproduction and limits

Archive the pinned main's src, package.json, tsconfig.json, tools/chat and declared fixture inputs into an isolated directory beneath this checkout, where existing dependencies resolve. Copy the final test into its final src/features/chat path. Run RED, apply candidate.patch to that archived graph, then run GREEN and the adjacent tests listed in the raw receipt. No vendor JavaScript is evaluated by qualification.

The scratch whole-app build and full chat suite have NOT RUN. Current-head integration, refreshed main ancestry and hosted checks for a future standalone PR have NOT RUN. The assigned #1418 tree and commits remain unchanged; separate publication follows only after #1418's actual merge and supported fresh-main reconciliation.

Historical REA renderer semantic analysis exhausted heap and skipped the renderer (`ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`). This is retained-byte qualification, not a new successful semantic/native analysis. No new REA/native acquisition or REA failure occurred. Existing gaps remain.

No app/server/provider execution, Mac/native action, package dispatch, installation or new watcher. No screenshot of the app exists within this source-only lane. Mounted source results are not browser pixels, real-provider compatibility, containing-package inclusion, installed identity or native parity. Existing package/E2E owners retain serialized acceptance. #1418 retains its existing CI/merge subscription; no duplicate watch was added.
