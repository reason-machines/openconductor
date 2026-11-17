# Typed subagent raw results — standalone delivery

Author: Conductor Rebuild. Contract: `CHAT.TYPED-SUBAGENT-RAW-RESULT`.

## Fresh integration

This is a separate successor to merged #1418, not an appended or stacked change. Refreshed default main and actual #1418 merge: `d18e6bf2f05580c11e51572c3a75e98749c6ff81`. The assigned Session branch was reconciled onto that main with a clean working tree before copying the frozen test and evidence packet. The initial qualification's historical main, V1/V2 corrections and raw logs remain in `QUALIFICATION.md`; its future-work statements describe that earlier snapshot, not this delivery.

The real-app retained REA renderer's complete `registry-dispatch → registry → hIt → bpo → yZe → Mu` bindings select typed Task/Agent/sub-agent results, gate disclosure by original content truthiness, and supply converted original content to Formatted, Raw and copy. Ten exact declarations and the complete retained parent SHA256 were reverified without executing vendor code. Historical semantic heap-exhaustion remains a REA gap, not native acceptance.

Current main retained `rawResult` through the Reason adapter/reducer/view but dropped it at typed dispatch. SubagentRow converted flattened text and gated on converted text. The fix forwards optional `rawResult`, falls back only on undefined, reuses unchanged `resultText`, and gates on original selected content. Intentionally falsy raw values suppress stale flattened output; an empty array retains disclosure even when its text is empty.

## Before/after on current main

The final frozen V3 test is byte-identical to the accepted qualification: SHA256 `dea7a1df1432b2b325944f1bd9243ac056ea59aec9e7be2a00ccd23e6107ae79`.

Before any production edit on refreshed main:

```bash
node --test --test-concurrency=2 src/features/chat/typedSubagentRawResult.test.ts
```

**Failed as intended:** 42 cases executed, 15 passing controls, exactly 27 `ERR_ASSERTION` content/disclosure failures; zero skips/cancellations. `current-main-red.json` pins the actual #1418 merge, fixture, production baseline and counts. No setup/import failure counted as RED.

After the scoped edit, the identical command and fixture **passed 42/42**, zero skips/cancellations. Actual production `applyReasonPayload → applyChatEvents → buildRows → ConductorToolRow → MoreRows → SubagentRow → RowShell → Markdown/Raw/CopyIcon` is exercised; clipboard and copy-confirmation timers are fake boundaries. The fixture's exact Markdown input and explicit existing formatted glyphs are checked separately from byte-exact Raw/copy. This is not a normalized glyph-parity claim.

**Adjacent passed 215/215:** new42, typed16/links, untyped fallback30, prefix18, generic16, Reason adapter, reducer, view, persistence, review results, conductorTools and retry. The historical qualification used a different command and counted 219; no cases are removed from that historical receipt.

Whole current-checkout typecheck, build and full chat-suite verification are recorded separately after this verified increment. Hosted exact-head CI is a separate merge requirement.

## Scope and integrity

Only typed MoreRows dispatch and SubagentRow in `ToolRows.tsx` change production behavior: five added/four removed lines. No GenericRow, InputOutput, Markdown, resultText, registry/map, backend/provider, style, nested-prefix fallback or other row-arm change. Original generic16, typed16/links, prefix18 and #1418 fallback30 fixtures are preserved. `delivery.patch` is the refreshed-main production delta; `candidate.patch` is the historical scratch candidate.

Commands and compressed raw logs are committed alongside the frozen source manifests. The verifier checks the retained parent, ten exact declarations, unchanged final42 fixture and seven pre-existing files:

```bash
python3 evidence/chat/typed-subagent-raw-result/verify-source.py \
  --renderer .ara-state/tmp/chat-next-gap/renderApp-D_fmY7hW.js --root .
git diff --check
```

Both checks passed on the integrated candidate.

## Acceptance limits and release custody

No app/server/provider execution, browser or Mac/native acquisition, package dispatch, installation or new watcher. No screenshot exists because this lane is explicitly source-only; mounted results are not browser pixels, real-provider compatibility, installed identity, containing-package inclusion or native parity. Full-repository and manual/native CI checks are not claimed by the focused checks above. Existing serialized package/E2E owners retain runtime acceptance. #1418's actual merge receipt and raw-result replay controls were handed to the existing package owner, who confirmed relay into the existing canonical successor custody.

Merge this standalone ready PR only after all executed exact-head workflows pass. Skipped manual jobs are not passing test execution.
