# Untyped subagent structured-result fallback

Author: Conductor Rebuild. Candidate: `CHAT.SUBAGENT-FALLBACK-STRUCTURED-RESULT`.

## Contract and mismatch

Pinned fresh default main: `eef01e9b287472280fb3f4a585bc697d5f1f8f51`.

The retained real Conductor renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Full bytes and eight exact declarations passed range/hash/text readback. The registry selects `bpo` for Task, Agent and sub-agent. Missing, empty and general-purpose `subagent_type` route through `bpo → Ypo → aUt → V9e` with the original tool result intact. V9e preserves strings, pretty-prints truthy structured content and hides falsy content. Complete UTF-8 half-open ranges/literals are in source.json.

Fresh main preserves rawResult through the adapter/reducer/view, but MoreRows' sub-agent generic return drops it. Existing GenericRow already handles it. This arm was explicitly excluded from generic16 and prefix-MCP #1410. This candidate does not change their fixtures or implementation.

Historical REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` skipped renderer semantic analysis after heap exhaustion. This retained-byte qualification is not a new successful semantic pass or native observation. No new acquisition, vendor execution, REA invocation or REA failure occurred; existing gaps remain open.

## Frozen baseline and candidate

Fixture SHA-256: `63d0454a0e67d18b893abef483e9b7b35403df94f43f96f008b3eb8ec522c65a`.

Thirty cases start at actual applyReasonPayload, applyChatEvents and buildRows, then mount production ConductorToolRow and its real MoreRows/GenericRow/RowShell path. All three exact names cover missing/empty/general-purpose types, resource metadata, verbatim strings, empty arrays, explicit null, legacy success/error, pending and false. Assertions cover collapse/open/close/reopen, status, labels, input/output and plain noninjected content. Unrelated Markdown/link/native dependencies throw if reached.

Before any product edit, archived pinned main produced **30 tests: 12 controls passed, 18 intended assertions failed, 0 skipped/cancelled**, exit 1. Metadata was reduced to Summary, raw strings were overwritten, [] had no disclosure, and explicit null resurrected flattened output.

The scratch-only candidate adds the existing rawResult prop at the sub-agent GenericRow return. No GenericRow implementation, InputOutput, typed consumer, provider/backend/maps, styles or other arms change.

**Passed on Reason Cloud, scratch graph only:**
- Same frozen fixture: 30/30 GREEN, no skips/cancellations.
- New30 + unchanged generic16 + unchanged typed16: 62/62 GREEN.
- npm run typecheck.
- npm run build (existing chunk-size advisories only).
- Full parent, eight exact declarations and unchanged fixture/generic16/typed16 readback.
- Tracked checkout remains clean; git diff --check passes.

Full logs are gzip-compressed without loss in the packet. The archived graph shares only the checkout's installed dependency directory; no dependencies were installed.

## Reproduction

From this checkout, with the final fixture present:

```bash
baseline=$(mktemp -d .ara-state/tmp/subagent-fallback-baseline.XXXXXX)
git archive eef01e9b287472280fb3f4a585bc697d5f1f8f51 src package.json | tar -x -C "$baseline"
cp src/features/chat/subagentFallbackStructuredResult.test.ts "$baseline/src/features/chat/"
node --test "$baseline/src/features/chat/subagentFallbackStructuredResult.test.ts"
```

The packet's verify-source.py checks inert retained bytes plus frozen tests; pass --renderer <retained-renderer-path> and --root <checkout-or-archived-graph>.

## Delivery and limits

No new product fixture/fix is committed to open #1410; production checkout/branch are unchanged. This qualified next unit is held independently until #1410's actual merge, then fresh-main reconciliation and separate ready PR. No further approval gate is implied.

Current-head integration/hosted checks for the next PR have not run. No browser, provider/server/runtime, Mac/native/REA acquisition, package dispatch, installation or watcher. No screenshot exists within this source-only scope. Mounted results are not native pixels, full-app parity, real-provider behavior, containing-package inclusion or installed identity. Existing package/E2E owners retain those boundaries.
