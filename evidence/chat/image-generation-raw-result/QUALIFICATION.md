# Generated-image original-result selection — qualified isolated successor

Author: Conductor Rebuild. Source-only workspace/chat lane; no new runtime, provider, native or package work.

## Exact contract and scope

Qualification baseline is default-main snapshot `08be22cfcb0034e23171fe9b5f3b0a5df93585f3`. The retained Conductor `D1o/Qpo/hIt → Vpo → yZe → Mu` pipeline selects original `toolResult.content`, converts it through `yZe`, trims it, and supplies the resulting bytes to fallback presentation. The renderer's complete import also binds `jm as oJ` to index export `ole as jm`, whose extension predicate and registry remain unchanged.

Current image-generation rows use only flattened `result`. When both values exist, this loses original string, text-block, object, array, null, false and zero semantics. This is a different consumer from the already-owned MCP/subagent/Node repairs. The ledger confirmed no competing image-raw-result owner.

The isolated candidate at source commit `1858b6e39` changes only two additions / one removal in the image-generation arm:

```diff
-      const path = result === undefined ? "" : resultText(result).trim();
+      const content = rawResult === undefined ? result : rawResult;
+      const path = content === undefined ? "" : resultText(content).trim();
```

Labels, default-open state, path normalization/classification, image loading/preview, copy/open actions, styles, resultText, shared RowShell, provider/backend paths, and all existing fixtures are unchanged. The legacy result fallback is selected only when rawResult is undefined. In particular null/false/zero are not treated as missing.

## Frozen actual mounted regression

Final **V2** fixture SHA-256: `267a2f2e09ba9c7bf87cce71f7ac622ac46baa53a9864f166b0493069c537edb`.

The fixture mounts real Reason adapter → reducer → buildRows → ConductorToolRow → MoreRows → RowShell. It observes output bytes, original-result carriage, header interactivity, default-open behavior, click callbacks and controlled closed state. Unrelated external/native/Markdown paths throw if invoked. It does not replace a provider with a successful fake or load any image.

- **RED passed as a reproduction:** restored untouched main `08be22cf`, then `node --test --test-concurrency=2 src/features/chat/imageGenerationRawResult.test.ts` — 12 controls pass / 12 intended assertion failures, exit 1; no skip/cancel.
- **GREEN passed:** identical frozen V2 and command after the isolated image-only change — 24/24, exit 0; no fail/skip/cancel.
- **Adjacent passed:** existing image fallback5, typed V3, generic, prefix-MCP and untyped subagent fixtures — 111/111. Existing fixtures are byte-identical.
- **Full chat passed:** `node --test --test-concurrency=2 src/features/chat/*.test.ts` on complete committed source `1858b6e39` — 1,849/1,849, no failure/skip/cancel. This baseline excludes #1431's new Node24 fixture because #1431 remains separately open; a future fresh-main replay must include it.
- **Typecheck passed:** `npm run typecheck` on complete committed source — exit 0.
- **Build passed:** `npm run build` on complete committed source — exit 0, existing chunk-size advisory only.
- **Source/integrity passed:** `verify-source.py` binds both entire parent assets, 11 exact byte spans including complete Vpo/yZe/Mu/import declarations, 15 consumer joins, frozen V2, nine unchanged controls and the exact image-only hunk. `git diff --check` passed; compressed logs were verified lossless.

Renderer SHA-256: `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde` (11,600,457 bytes). Index SHA-256: `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3` (3,493,297 bytes). No vendor JavaScript executed.

## Preserved non-passing attempts

V1 `96dd51db…2cb8e42` had a TypeScript narrowing error in the test's `assert.equal(typeof production.opensByDefault, "function")`; V2 changes only that statement to `assert.ok`, with no input/expectation changes. Untouched production was restored and the full 12P12F baseline replayed before the V2 freeze. V1 is disqualified for delivery and retained as compressed text, never substituted for V2.

The first partial archive omitted test/Rust context: its full-chat dispatch reached the 180-second call limit, with missing-file failures, and is not a passing run. A complete committed worktree corrected the source context without changing tests; its later full 1,849 pass is the verified result. The first build had a broken relative dependency link; the corrected link resolved the existing Vite installation and the subsequent build explicitly exited 0. All these earlier logs are retained, not normalized into successes.

## Delivery and acceptance boundary

#1431 remains frozen on the assigned branch under this Session's sole exact-head CI-to-merge subscription. This candidate is committed only in a separate main-based worktree; it is not appended or stacked on that open PR. Separate ready publication is pending #1431's actual merge, fresh-main replay (including unchanged Node24 and typed V3), and reconciliation of its actual squash pin with ledger/release custody.

**Browser/native/provider/package acceptance: NOT_RUN / UNVERIFIED.** No app screenshot exists in this source-only lane. Raw-only result events without a flattened output, malformed non-string `text` fields, real image fetching, persisted mutation, provider policy and installed package identity are not exercised. Historical REA semantic heap exhaustion remains a tooling gap; retained-source qualification is not native parity. Existing runtime/native/E2E/package owners retain all acceptance work; no duplicate dispatch or watcher was created.
