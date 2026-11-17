# Preserve raw results at the untyped subagent fallback

Author: Conductor Rebuild. Contract: `CHAT.SUBAGENT-FALLBACK-STRUCTURED-RESULT`.

## Qualified contract and smallest repair

Retained Conductor renderer SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` (11,600,457 bytes) dispatches Task, Agent and sub-agent through `bpo`. Missing, empty and general-purpose subagent types select `bpo → Ypo → aUt → V9e`, forwarding the original result. V9e preserves strings, pretty-prints truthy structured bodies and hides falsy content. The eight complete declarations, UTF-8 half-open ranges, hashes and literal text are in [source.json](source.json); no vendor code was evaluated.

Current default main `1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5` contains the actual merge of prefix-MCP #1410. Its adapter, reducer and row view retain `rawResult`, and `GenericRow` already implements this formatting contract. Only the untyped subagent return inside `MoreRows` drops the prop. The production repair forwards **one existing prop** at that return. GenericRow, typed subagents, InputOutput, nested prefix routing, other row arms, backend and providers are untouched. Simple internals, strict boundaries, isolated volatility.

## Frozen before/after regression

[freeze.json](freeze.json) is the unchanged original qualification manifest at main `eef01e9b287472280fb3f4a585bc697d5f1f8f51`. Fixture SHA-256 remains `63d0454a0e67d18b893abef483e9b7b35403df94f43f96f008b3eb8ec522c65a`.

The exact same final-location fixture was replayed on refreshed default main `1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5` **before the production edit**:

```bash
node --test src/features/chat/subagentFallbackStructuredResult.test.ts
```

- **RED:** 30 tests, 12 passing controls and 18 intended assertion failures, exit 1; zero skipped/cancelled. No loader failure. Resource metadata became flattened Summary, raw strings were overwritten, empty arrays lost disclosure and explicit null resurrected flattened output.
- **GREEN:** unchanged 30-case fixture passes 30/30, exit 0, zero skipped/cancelled.

All three exact tool names exercise missing/empty/general-purpose types, raw resource metadata, verbatim strings, empty arrays, explicit null, legacy success/error, pending and false. Tests enter real `applyReasonPayload`, `applyChatEvents`, `buildRows` and mount production `ConductorToolRow → MoreRows → GenericRow → RowShell`. Assertions exercise status, labels, input/output and repeated collapse/reopen without HTML injection. Unrelated Markdown/link/native dependencies throw if reached. Existing generic16 and typed16 fixtures remain byte-identical; this does not claim unexercised nested-prefix behavior.

Raw outputs are retained losslessly as gzip alongside this note. [QUALIFICATION.md](QUALIFICATION.md) records the earlier scratch-only qualification and is historical, not the current delivery receipt. [current-main.json](current-main.json) pins the refreshed baseline separately rather than rewriting that history.

## Current integration checks

Executed on Reason Cloud:

```bash
node --test src/features/chat/subagentFallbackStructuredResult.test.ts
node --test src/features/chat/*.test.ts
npm run typecheck
npm run build
python3 evidence/chat/subagent-fallback-structured-result/verify-source.py --renderer .ara-state/tmp/chat-next-gap/renderApp-D_fmY7hW.js
git diff --check
```

- **Passed:** unchanged focused fixture 30/30.
- **Passed:** whole-app typecheck and production build; existing chunk-size advisories remain.
- **Passed:** full retained parent, eight exact declarations and unchanged frozen30/generic16/typed16 fixtures.
- **Pre-commit suite:** 1,770 pass / 1 failure / zero skips or cancellations. `disclosureRemount.test.ts` correctly rejected a candidate whose ToolRows working bytes differed from its committed Git blob. No disclosure behavioral assertion failed; the clean-commit guard is unchanged.
- **Passed on committed source `14ea163c1`:** whole chat suite, **1,771/1,771**, zero failures/skips/cancellations. Complete raw output is retained as [chat-suite.tap.gz](chat-suite.tap.gz). This includes the unchanged disclosure remount baseline/candidate component replay, prefix18, generic16 and typed16 controls.
- **Passed:** final diff hygiene and unchanged frozen fixture/source bindings.

The exact-head hosted workflow result is reported separately; it is not inferred from local success. A final documentation-only receipt commit leaves the exercised production/test sources unchanged.

## Reproduce the refreshed RED without editing the candidate

```bash
baseline=$(mktemp -d .ara-state/tmp/subagent-fallback-baseline.XXXXXX)
git archive 1d8c37ab634e4eca9f86d54c138dc73fb0ee3fb5 src package.json | tar -x -C "$baseline"
cp src/features/chat/subagentFallbackStructuredResult.test.ts "$baseline/src/features/chat/"
node --test "$baseline/src/features/chat/subagentFallbackStructuredResult.test.ts"
```

The baseline under this checkout resolves installed dependencies from the checkout's node_modules. Expected exit 1 with exactly the 18 named content/disclosure failures, not infrastructure failures. `verify-source.py` requires the inert retained parent from the qualification packet and accepts `--root` for a separately unpacked graph.

## Acceptance limits and REA gap

Historical REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` skipped renderer semantic analysis after heap exhaustion. This is retained-byte qualification, not a new successful REA semantic analysis or native observation. No new acquisition, vendor execution or REA failure occurred; existing gaps remain open.

No browser, app/server/provider execution, native action, package dispatch, installation or new watcher. No screenshot exists within this source-only scope. Mounted assertions are not browser pixels, full-app side-by-side/native parity, real-provider compatibility, installed identity or containing-package inclusion. Existing package/E2E owners retain those steps. Manual-only CI jobs are not run, not passed; only actual exact-head hosted outcomes qualify delivery.
