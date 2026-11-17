# Closed icon-only Open in trigger arrows

Conductor Rebuild requalified the retained `ICON-TRIGGER-ARROWS-15` packet against main `f60b6e365395ceb62b2b2ec6e1542a16a5b0d0ee`, then rechecked applicability at fresh main `4cbaa9f6cdf995f3654ec8d6a49e984050ee9784` before the product edit (the component baseline is byte-identical). Ledger cleared only `OpenInButton.tsx`, the new `iconMenuTriggerArrows.test.ts`, and this evidence directory. Typeahead, split-menu semantics, shared keybindings, app catalog and native launchers are out of scope.

## Reference and current-source mismatch

The original Conductor 0.87.6 renderer is 11,600,457 bytes, SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Retained REA lineage is `ev_338577609e67c31212d529d59606e90597850528ea9a2f9559d23a4876c960d1`. [Original source receipt](source.json) pins 21 byte spans, all rehashed before publication. The exact original archive was restored with SHA-256 `e41c6b30b1de4da14c3f2404ecfa4fb67bb3a800f41f07319b2cb6835b61e0b2`; no original app, extracted JavaScript, or new REA process was executed.

The checked source chain is `P9(size=icon)` → `h2` → `oF` → `SLt` → `eEe.triggerProps` → `Ede` → the rendered native button. `oF` defaults to vertical orientation and enables arrow opening for this non-context root. `aFe`, `S4t`, `RQe` and the arrow constants prove that ArrowDown opens with the first enabled item selected and ArrowUp opens with the last enabled item selected. Item registration, DOM order and disabled-item filtering are retained too. This is compiled-source evidence, not observed native behavior.

On checked main the chevron has `onClick` but no `onKeyDown`. The open effect always focuses the first menu row. Automatic hosted CI reproduced the mismatch at head `4597be2537ada1bcc6c8fb0156a1abf11b28f917`: all six predicted cases fail with `ERR_ASSERTION` and all nine controls pass. [Hosted RED receipt](hosted-red.json) links run `44029103322`, job `133856448308`; this is a mounted component reproduction with substituted DOM/native boundaries, not observed native behavior.

## Frozen regression and minimal correction

The original 15-case regression is copied byte-for-byte to `src/features/openIn/iconMenuTriggerArrows.test.ts`, SHA-256 `593c025f7fb0e8f7d75092dfc477ec824df0d33360b672f368ef60f8fbf8be7a`. It mounts the production component with bounded DOM focus and native-boundary substitutes. Four arrow/disabled-endpoint cases and two Escape/reopen cases failed before the fix. Nine passing controls preserve pointer opening, split behavior, already-prevented events, disabled triggers, unrelated keys, and exact app/clipboard calls. [Selected original contract](behavior-spec.selected15.json).

After the hosted assertion RED, the minimal correction adds one `first | last | null` ref, handles arrows only on a closed enabled icon trigger, skips disabled rows for arrow-initiated endpoint focus, and consumes/resets that opening edge in the existing focus effect. Ordinary pointer opening and the open-menu keyboard handler remain unchanged. The historical patch predates the merged pointer-focus handler; fresh-main composition preserves that handler, its mouse-event import and both row bindings byte-for-byte. [Fresh-main binding](fresh-main-binding.json).

## Verification

- `python3 evidence/open-in/icon-trigger-arrows/verify_source.py`: checks retained span lengths/hashes, fresh-main baseline identity, unchanged 15-case fixture and product identity. Source/integrity verification only.
- `git diff --check`: whitespace validation.
- Automatic hosted `NODE_ENV=development node --test "src/**/*.test.ts"` at baseline head `4597be2`: **RED reproduced**, 4,591/4,597 tests pass, exactly six assertion failures, no skips; the frozen 15-case fixture yields six failures and nine passing controls. The fixture is unchanged for the correction.
- Baseline `npm run typecheck`: **PASS**. Build and later steps were **SKIPPED** after the unit-test failure, not passed.
- Candidate unchanged-fixture GREEN, typecheck/build, and all automatic exact-head workflows are **PENDING** and must pass before merge.

No local application/test runtime, dependency installation, browser, native Mac, manual workflow dispatch, or duplicate executor is started. Browser/native/package acceptance is **NOT_RUN**. No screenshot is supplied because runtime capture is outside this source-only unit; the sole E1 owner retains native acceptance. No new REA gap was encountered; historical retained evidence and tool limitations are not promoted into a successful fresh capture.
