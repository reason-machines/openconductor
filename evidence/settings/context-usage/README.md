# Context usage: local provider → wire → runtime → Composer

Owner: Conductor Rebuild / SAME49. Baseline main: `350276dac249fa14d24ec2460c5397a1e61cec97`.

## Defect and scope

General's `always_show_context_wheel` boolean was registered, stored and rendered,
but no Composer consumer existed. Existing `TokenUsage` is cumulative turn
accounting with input/output fields only; it cannot provide current context.
The old runtime also discarded context-only updates because they contain no
transcript event. Codex has a separate runtime, so fixing the generic runtime
alone would leave its real provider disconnected.

This increment adds one independent context contract and state codec, actual
local-Claude and Codex producers, both runtime receivers, persistence, and the
Workspace snapshot → Composer display seam. `TokenUsage`, cumulative cost,
queue/approval behavior and chat-message schemas are not changed.

## Reference qualification

`reference-spans.json` records complete inert AST spans and UTF-8 byte hashes
from the retained REA-qualified real Conductor assets. Neither reference bundle
nor extracted functions were executed. No new Mac/REA run occurred.

- `ITo` reads `always_show_context_wheel`, rounds context percent to one decimal,
  then shows the control when always-on, internal metadata enabled, percent ≥70,
  or the agent is ACP. Missing usage does not establish a known percentage.
- `Qmo` has a `Context usage` button and a 14px ring, plus a top/end popover. The
  original's provider-plan/quota/metadata subpanels are not claimed recreated by
  this bounded occupancy increment.
- `Doe` reads only top-level assistant usage and includes input, cache read,
  cache creation and output. Empty/zero assistant samples do not reset context.
- `oct` selects the latest sample, resets on `compact_boundary`, and obtains
  model-specific denominators from result `modelUsage.contextWindow`, not from
  cumulative result token totals.
- The internal metadata condition is an authenticated feature flag, not a new
  user preference. Composer exposes an optional internal flag (default false);
  there is no fabricated settings key or invented authenticated flag response.

Official Codex `rust-v0.166.0` protocol source independently qualifies the local
producer envelope: `thread/tokenUsage/updated` with `threadId`, `turnId`, and
`tokenUsage.{last,total,modelContextWindow}`. Only explicit safe
`last.totalTokens` is used. Cached input and reasoning are not added again.
The frozen official-source packet is an original Session upload, SHA256
`4b493de299e2420874e5d7eb1f5a6821dded7b0aceb6d60fa211302031e1397e`.
It qualifies the provider schema, not an observation of live Conductor Codex.

Reason ACP source at `c8dcb13f487b0504ca7b2ea400976d9f9c88f276` emits no structured
context notification. Its wheel is shown for ACP but reports unavailable, never
zero or a percentage inferred from result billing. This is source inspection,
not identification of Sven's installed/released CLI binary.

## Owned invariants

- `ContextUpdate` is separate from cumulative `Usage` on the wire.
- Latest samples replace, rather than add to, previous context.
- Token values are nonnegative safe integers; malformed values are not coerced.
- Claude's component sum includes both cache fields. Explicit Codex total zero
  is valid; a zero-only Claude assistant sample is ignored.
- Model denominators do not leak to another model or unattributed sample.
- A context-only event publishes a snapshot even without an open turn, without
  creating a transcript message.
- Per-chat versioned context state persists independently. Compact resets save
  a zero boundary without old cache counts. New provider session/thread identity
  invalidates old context. Unknown data stays unknown.

## Frozen RED → GREEN

The final 13-case regression is `src/features/chat/contextUsageFlow.test.ts`,
SHA256 `fd723b15bba8d3143413747fb81cdb8f14ebf05d87626ee02d098c24102e5f3b`.
It reproduced **3 pass / 10 intended failures / zero skips** against the original
tracked reducer/runtime/Composer; treatment passed **13/13**.

Two harness corrections were made before the final immutable replay: starting
the real listener via a separate bootstrap chat, and supplying the internal
metadata feature flag through a prop rather than mocking a nonexistent boolean
preference. Original cases/assertions remain; all three fixture revisions and
baseline logs are preserved in `frozen/` and `logs/`. The earlier `f005…` hash is
not described as the unchanged final fixture.

`codexContextFlow.test.ts`, frozen SHA256
`5a37023709d31bdea621fcd854a337ddea857c7d4a401edf2200754557ea1e4e`,
reproduced **0 pass / 2 intended failures**, including the real singleton
runtime's missing-payload branch; treatment passed **2/2**. It checks context-only
publication, latest replacement, transcript isolation, persisted reset/reload,
and chat isolation through the actual Codex adapter.

An additional session-replacement check first failed **1/7**; after identity
invalidation, all seven codec/lifecycle controls passed. Shared native Claude
vectors are also consumed by the TS codec tests.

Command for the complete focused set:

```bash
node --test --test-concurrency=1 src/features/chat/{contextUsage,contextUsageFlow,codexContextFlow,chatRuntime,reason,codex,codexChat,composerReservedSpace,composerSpeechToText}.test.ts
npm run lint:colors
```

Observed on Reason Cloud: **73 tests passed, zero failed/skipped**; color linter
and its six controls passed. Raw logs are retained. Default frontend build,
actual Rust behavioral replay, browser evidence, exact-head workflows and merge
are recorded in the subsequent verification receipt; they were not yet run at
this first source milestone.

## Acceptance limits

No local agent/provider execution, Mac/native process, signed package or physical
side-by-side behavior has been exercised by this milestone. Browser component
proof, when recorded, uses real General settings/runtime/Composer with synthetic
provider samples and does not prove native producer execution or full-app
acceptance. Native/package custody remains with its existing owner.
