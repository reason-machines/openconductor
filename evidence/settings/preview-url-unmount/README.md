# Cancel pending Preview URL edits on normal unmount

Conductor Rebuild · PREVIEW-URLS-ROW-49 · 17 November 2026

## Cause and narrow change

Fresh main `6ea9565048bfdc730e6ddc03c279d988031fe2e1` reproduced a distinct lifecycle mismatch: editing a repository Preview URL and unmounting its row before the 500 ms debounce emitted a write. The retained original row cancels that pending callback. The current flush-on-unmount call was introduced in #1188; its restart drain and ownership guarantees must remain intact.

Three production files change, **21 insertions / 9 deletions**:

- `RepoMiscRows.tsx`: add an explicit optional unmount policy to the existing local debounce helper; only Preview URLs opts into `"discard"`. Files to copy retains the existing `true`/flush default.
- `producer.ts`: `PendingEdit.discard()` settles only its unsent draft. An additive `"discard"` hook policy leaves `false`/default abandon and `true`/flush behavior unchanged. Restart drain still calls `flush()` through the existing owner.
- `owner.ts`: an idempotent neutral `cancel()` settles that unsent obligation and advances revision, without updating successful acknowledgments or failures. It cannot erase an older real write failure, cancel an already-started save, or make default abandon silently succeed.

The registry, restart lifecycle, other row callers, Action Preview and Reset/empty-override controls are unchanged. No API, Rust, settings schema, backend command or dependency changes.

## Retained real-app evidence

`reference.json` retains **25 complete declarations/import/export bindings**, whole asset identities, half-open UTF-8 ranges and individual hashes. Source was read from already-held REA assets on Reason Cloud, not newly acquired:

- Renderer: 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Index: 3,493,297 bytes, SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.

`Sba → X3a` binds the normal row. `PYe` imports index `dzt as gQ` for its effective value; `p8r` imports `G6t as sf` for save. `ezt/xJs/_Js/vJs` normalize editor rows; `wJs` trims names/URLs and drops missing URLs. `X3a` uses `aD(...,{wait:500})`, whose default cleanup calls `kos.cancel()`; the complete class clears its timer without calling the save callback.

`context-closure.json` records complete inert AST inspection, zero parse diagnostics: the unexported `pos` context binding has exactly its declaration and `mos/useContext` reference, with no provider, alias or export reference in that complete renderer. No default `debouncer.onUnmount` override supplies a flush. Original JavaScript is inert data, never executed.

Empty URLs deliberately differ from Actions blanks: `wJs` returns `""`, and `G6t` explicitly deletes `open_url_template` and its legacy key. Current null deletion is preserved; no explicit-empty URL override is introduced.

## Frozen baseline and treatment — Reason Cloud

```bash
node --test --test-concurrency=1 evidence/settings/preview-url-unmount/unmount.test.cjs
```

Frozen original fixture SHA-256 `9172057e530f7d7c6162554f62a73a0340664ea4887312d3c0d8099efc041746`:

- **Before:** 3 collected, **2 PASS / 1 intended assertion FAIL**, zero harness errors/skips. The failing case observes a real production callback issuing one synthetic-memory `preview_urls` write after normal unmount before 500 ms.
- **After:** byte-identical fixture **3/3 PASS**. Unchanged-unmount and mounted-after-500-ms controls also pass. No original assertion or helper changed.

The fixture executes the real private row (exposed only by an appended test-host export), API/hook, PendingEdit, WriteBarrier and registry. IPC/timers are synthetic and allowlisted; unrelated presentation/import hosts are explicit stubs. It proves lifecycle callback/write intent, not physical native navigation or disk transport.

Additional frozen lifecycle controls: **3 PASS / 1 intended assertion FAIL → 4/4 PASS**. They cover active restart drain, normal cancellation without a poisoned registry, in-flight acknowledgment retention, and unchanged blank-delete semantics. The derivative harness adds only test-host observation and a delayed synthetic acknowledgment; the original three-case fixture stays byte-identical.

Owning contract baseline and treatment: **4/4 PASS before and after**, unchanged fixture SHA-256 `ba148ebc90b158329252e58408e3500895059180f5070454b1804c86b1070658`. A retired abandoned editor still fails without silently saving; active restart drain saves the latest draft once and waits; retired in-flight owners keep acknowledgment/failure ownership.

Ten new neutral-cancellation controls pass: idempotency/revision, cancellation after success, retention of older recorded/late/refused failures, future actual success, repeated discard/future edits, in-flight save/failure races, and receipt invalidation. The full focused wrapper contains **21 cases**, all passing.

## Affected and ownership checks — passed

```bash
node --test --test-concurrency=1 \
  src/settings/previewUrlUnmount.test.ts src/settings/repoMisc.test.ts \
  src/settings/actionResetOverride.test.ts src/settings/actionPromptPreview.test.ts \
  src/settings/rows/rowModel.test.ts src/settings/rows/repoGitDeleteReset.test.ts \
  src/settings/prompts.test.ts src/settings/configSyncPendingSelection.test.ts \
  src/features/updates/restartWhenIdle.test.ts
```

**106/106 PASS**, zero skips/cancelled. This includes the unchanged Reset/empty-override controls, not just Preview URLs. Complete TAP is retained in `adjacent-treatment.tap.gz`.

```bash
node --test --test-name-pattern='real (registry|barrier|editor)' \
  evidence/settings/restart-when-idle/safetyIntegration.selector-loader.test.cjs
```

**5/5 selected existing owning controls PASS**, no skipped cases reported by this Node runner. The broad App/runtime suite was not replayed. Raw output is `owning-contracts-treatment.tap.gz`.

```bash
python3 evidence/settings/preview-url-unmount/verify.py
npm run lint:colors
git diff --check
```

Source/freeze/scope verification, color lint (six tests plus full scan), and whitespace checks pass. Local typecheck/default build were **NOT_RUN**: exact-head hosted frontend checks cover those without a duplicate heavy pipeline. No compiler slot was taken.

## Delivery and acceptance boundaries

The ready PR targets **main**, not a stacked branch. This Session owns exact-head CI-to-actual-squash delivery and merges only once every executed exact-head check succeeds; conditional skips are not test passes.

**No screenshot/recording:** no browser/app/native/runtime admission exists in this lane, and this change adds no geometry. Physical row navigation/timing, Tauri transport, actual settings-file persistence, installed identity and package inclusion remain **UNVERIFIED** with existing sole release/native custodians. Synthetic IPC is not native persistence. No provider, source acquisition, package/build dispatch or duplicate watcher was initiated.

The previous #1464 actual squash is `65caed6f55c4f9070b04f9d15534f3ebd6018f6e`, separately retained in canonical release custody. This change does not reopen its implementation or claim its native acceptance.
