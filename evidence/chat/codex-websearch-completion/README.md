# Codex web-search completion result

Conductor Rebuild qualifies and repairs `CODEX-WEBSEARCH-COMPLETION-RESULT-BE7`. The production boundary is only the successful-completion output expression in `src-tauri/src/agent/codex_wire.rs`'s `webSearch` arm. Tool title, input/query, status, running output, other item mappings, `codex.ts` and `ToolRows.tsx` are unchanged. Action-based open-page/find-in-page expansion is not part of this repair.

## Source and fresh default branch

Retained Conductor 0.87.6 REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` supplies the original shipped renderer and companion index. `source.json` seals both asset identities, 23 exact original spans, 24 reference joins, eight current-source file identities and 14 current joins.

The normal original `tnt` item translator sends a matching result on `item.completed`. `Wst(query)` returns `Web search completed for: query` for a nonempty query, otherwise `Web search completed`. `el` emits the user tool-result block. `TOo`/`ioi` pair it with the call; `ROo`/`hIt` dispatch it through the registry to `upo`, which exposes a disclosure when that content is present.

On checked main `d90bed88174656d577adfa793d3850d28eaea7e2`, the actual native Codex mapper returns `output: None` for this item. `codex.ts` stores an empty result, so the existing frontend correctly has no content to disclose. Main was fetched again and merged at `073c7b4e2287598f795c350b8fdb5358122c4a06` before the product edit; the eight relevant files were unchanged between those commits. The archived baseline is the actual complete Rust source, not a reimplementation.

The narrower web-header fallback candidate was rejected before a repair: original `o5r`/`Sjt` parses the completion prefix, but the current normal producer does not emit that prefix at all and updates its query input on completion. Inventing a missing-query/prefix-output payload would not establish the current supported producer path.

This is retained shipped-source REA evidence plus an inert-event parser/component regression, not native parity. The historical REA semantic renderer analysis exhausted its heap. No new REA acquisition or semantic rerun was attempted.

## Frozen behavioral RED

The three frozen files in `tests/chat-web-completion` are byte-identical before and after the product edit:

- `cases.json`: `1e9488d2e5ee3b3042dafe1d6710cd36f705e032ed67a3ce6de831ede32d9e2b`.
- `probe.rs`: `b0915674084f8856e2f61b84a3e31a9abd04e79901362f7a9c359677eb43de9f`.
- `fixture.test.ts`: `3f12dbc9fc6d588e45794a3ed68777bd047cddcff23fb9001831aaf3cc1a4bfc`.

The isolated driver includes the unchanged complete production Rust modules. It reads generated native app-server notification JSON, calls the actual `ServerMessage::parse` and `codex_wire::payloads`, and serializes their real output. No mapped frontend payload is fabricated. It never launches a provider, app or credential operation. An admitted offline, one-job serde/serde_json-only compile passed in 9.60 seconds; its compute slot was explicitly released afterward.

That actual serialization feeds the real Codex adapter, reducer, view, tool normalizer and production `ConductorToolRow`, mounted with real React. Unrelated Markdown/link/external-open dependencies throw if reached rather than substitute web behavior. No row/normalizer/adapter logic is extracted or rewritten.

`baseline.tap.gz` (lossless original TAP bytes): **12 executed, four passed, eight intended assertion failures, zero cancellations/skips**. Completed ordinary, empty, whitespace and markup-like queries each fail the producer-output assertion and mounted row-disclosure assertion. Both running-query variants pass both checks. Every failure has `ERR_ASSERTION`; there are no loader, compilation or transport failures. `baseline-payloads.json` retains the actual producer output. `baseline-receipt.json` binds the complete logs and frozen bytes.

All **42 unchanged adjacent checks passed**: Codex adapter, tool normalization, WebFetch prompt disclosure and web-result truncation. No preexisting expectation was changed.

## Reproduce

The portable runner needs already installed frontend dev dependencies and cached Rust serde/serde_json packages. On shared compute obtain the heavy-check slot first; it performs one bounded foreground Rust compile with one job, then the frozen mounted test. It does not install dependencies, run Tauri or invoke a provider.

```bash
python3 tests/chat-web-completion/run.py --output .ara-state/tmp/web-completion-replay
```

Use `--node-deps /path/to/existing/node_modules` when dependencies are in an existing isolated checkout, and `--target-dir` to reuse this Session's private Cargo cache. The runner symlinks actual read-only production sources into a temporary scene and copies the unchanged fixture there; it writes no fixture into production `src`.

The approved `cfg(test)`/`path` hook appends the same six native-event cases to the normal `codex_wire` Rust unit suite. It changes no production API or visibility. Local validation included the seven complete production modules in a minimal serde/serde_json-only test crate: **38/38 passed**, including the six new native cases, with zero ignored or filtered tests. The exact wrapper/manifest snapshots and complete lossless log are retained under `treatment/`. The existing environment test does run an inert shell `printf` with explicitly synthetic variables; the suite is not process-free, but never launches Codex, a provider, Tauri or the app and never reads credentials.

Cheap source, immutable baseline and scope verification:

```bash
python3 evidence/chat/codex-websearch-completion/verify.py
```

Supply `--renderer` and `--index` with the retained original full-asset paths to recheck the asset digests and exact byte offsets. Add `--green .ara-state/tmp/web-completion-replay` only after a complete treatment run.

## Current verification limits

- Source/full-asset/frozen/baseline/scope verification: **passed**.
- Frozen actual-producer-to-row baseline: **qualified RED**, as above.
- Adjacent tests: **42/42 passed**.
- Treatment probe compile: **passed**, one job/offline, 0.96 seconds.
- Identical frozen actual-producer-to-mounted-row regression: **12/12 passed**, zero cancellations/skips. This is the same fixture/input/probe that produced the four-pass/eight-intended-failure baseline.
- Complete seven-module synthetic Rust unit suite: **38/38 passed**, zero ignored/filtered, including all six newly wired native cases; test compile passed in 2.75 seconds.
- Fresh-checkout adjacent tests after the patch: **42/42 passed**. Exact scope, original assets, frozen files and treatment replay verification: **passed**.
- The exclusive compute slot was explicitly released after the sequential foreground pipeline; no own compiler/parser child remained.
- Product build/typecheck, browser screenshot, native app, real provider and installed package: **not run in this unit**. There is no screenshot because no browser/native run was admitted. This native mapper-only product change does not alter TypeScript.
- Earlier full-chat test timeouts remain **incomplete**, not passes, and do not stand in for this regression.

No duplicate runtime, native/package executor or watcher was started. `commands.json` records executed commands, results and limits; `treatment/` retains the actual mapped payloads, source manifest, complete mounted TAP and compressed compile/unit-suite logs. Exact-head CI and existing exclusive release custody remain separate from these local checks.
