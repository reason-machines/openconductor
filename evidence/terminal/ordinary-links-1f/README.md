# Ordinary terminal encoded-link activation

Conductor Rebuild closes `ORDINARY-TERMINAL-ENCODED-LINK-ACTIVATION-1F` with sixteen added production lines: two existing imports and the xterm `linkHandler` option in `src/features/terminal/session.ts`.

## Contract and retained original

REA parent: `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.

The sixteen exact-parent spans and both complete-asset SHA-256 values are in `qualification.json`; raw, inert original spans are under `reference/`. They bind ordinary interactive `lSa → eSa → w9e → dno → uno → cno → lno → ano`, and the cross-chunk confirmation/opener aliases through `wXt` / `Rue`.

The ordinary encoded/OSC8 handler requires Meta/Command activation, disables non-HTTP protocols, warns with **Open this terminal link?**, and opens only after **Open**, not **Cancel**. The patch uses the already-shipped `ScriptOutput` HTTP(S) validation, Meta-only gate, warning, approved `openUrl` call and rejection handling. ScriptOutput itself is unchanged. No new bridge, dependency or abstraction.

The native REA gap is retained: no new acquisition ran; minified imports/exports require explicit exact-parent byte joins rather than assuming REA resolves cross-chunk aliases. No original JavaScript was executed.

## Frozen reproduction and treatment

Qualification baseline: `c82bc60af7ac97c560d669c17178cf1fba2a0003`. Immediately before editing, the exact same ordinary session was rechecked on fresh main `d90bed881` (full identity in `integration.json`). Both session SHA-256 values are `a66e5172b5dfe545c6a45ea441447894193ae4c0c11a594a89f15704c50d7f28`.

Frozen new fixture SHA-256: `50cf0952aafe318cd48681bf66afccced2fa41a4a606593b5314ce88b5ca4fcc`. `src/features/terminal/ordinaryLinks.test.ts` remains byte-identical to `frozen-ordinaryLinks.ts.txt`.

```bash
timeout 180s nice -n 19 node --max-old-space-size=512 --test src/features/terminal/ordinaryLinks.test.ts
```

- Before: **4 passed / 8 intended assertion failures**, no loader/setup failures. Preserved original `before.tap` and repeated `fresh-main-red.tap`.
- After: **12/12 passed**, `green.tap`.
- Positive/negative controls: exact HTTPS and HTTP/localhost target, warning-before-opener ordering, cancellation, unmodified and Control-only activation, malformed/non-HTTP targets, warning/opener rejections, warm reattachment, starting/exited state, input gating, Unicode and disposal.
- The actual session, installed dialog plugin JS and backend opener bridge run. Only DOM/xterm surface, PTY/storage and native IPC edges are inert; no actual URL is opened.

## Adjacent verification

```bash
timeout 180s nice -n 19 node --max-old-space-size=512 --test --test-concurrency=1 src/features/terminal/{ordinaryLinks,alternateLineEdit,alternateClear,clearRedraw,cursorState,nonrunningInput,ordinaryCopy,ordinaryThemeRefresh,resizeState,sessionLineFeed,sessionUnicode,spawnFailure,startupCancellation,startupDisposal,terminalAnsiTheme,selectionTheme}.test.ts
timeout 180s nice -n 19 node --max-old-space-size=512 --test src/scripts/outputLinks.test.ts
timeout 90s nice -n 19 npm run lint:colors
```

- Focused: **196/196 passed**, including the frozen twelve; `adjacent.tap`.
- Read-only ScriptOutput encoded-link precedent: **10/10 passed**, `script-output.tap`.
- Color lint: **six tests plus complete source scan passed**, `lint-colors.log`.
- `git diff --check`: passed.
- Fourteen existing session test-loader maps add only throwing `confirm` / `openUrl` boundary entries. Their assertions and all existing code bytes remain unchanged after removing those two entries; exact file list and machine audit are retained in `integration.json` / `verify.py`.

```bash
python3 evidence/terminal/ordinary-links-1f/verify.py \
  --renderer .oc-tmp/rerun-output-identity-source/renderApp-D_fmY7hW.js \
  --index .oc-tmp/rerun-output-identity-source/index-BGEQ8YjU.js --green
```

**154 source/fixture/receipt checks passed** across sixteen original spans, including complete-original asset identities, unchanged fixture, both RED receipts, GREEN receipts, unchanged ScriptOutput, archived/hashed legacy loader originals, and boundary-only legacy-loader changes. Omit the asset arguments to verify retained span hashes/joins without the complete local originals; that mode explicitly does not verify full asset bytes.

## Hosted CI import-boundary correction

The first hosted run at `331db83b3b6d5c4a29cdd83542eb6ebd7aedc3b6` passed typecheck, color lint and 5,373 of 5,378 unit tests. All five failures were the resource-label fixture's closed module allowlist rejecting the new dialog import before reaching its behavior assertions. Build was skipped after that test failure; this was not a passing build.

The correction adds only two entries in `evidence/resource-terminal-labels/regression.cjs`: `confirm` and `openUrl` use its existing throwing `unexpected` boundary. No native call can be silently accepted, and no product code, behavior assertion, expectation or invocation changes.

```bash
timeout 180s nice -n 19 node --max-old-space-size=512 --test evidence/resource-terminal-labels/regression.cjs
timeout 180s nice -n 19 node --max-old-space-size=512 --test src/features/terminal/ordinaryLinks.test.ts
python3 evidence/terminal/ordinary-links-1f/ci-loader/verify.py
```

- Identical resource-label command: **0 passed / 5 import failures → 5/5 passed**.
- Byte-identical frozen encoded-link fixture: **12/12 passed** again.
- The original resource-label fixture, RED and GREEN receipts, and byte-exact boundary-only audit are retained under `ci-loader/`.
- No local heavy check, product runtime, native URL activation or package executor ran. Full corrected-head hosted verification remains required before merge.

## Scope and acceptance limits

- No plain-text WebLinksAddon, WorkspaceView/attachment focus, ScriptOutput, PTY, input/output, Find, copy, reset, selection lifetime or dependency change.
- Local full typecheck/build: **not run**, awaiting ledger-serialized heavy admission. Hosted exact-head checks are required before merge; no check is weakened or skipped by this patch.
- Actual OSC8 hit-testing, physical Command-click, native warning/default-browser delivery, real PTY/provider and packaged/installed-build acceptance: **not run/unverified**. No screenshot because product browser/native execution is exclusively owned elsewhere; source callback proof is not UI parity.
- Existing release custody retains prior #1449 `c82bc60a` inclusion and native clipboard replay obligations. This increment starts no runtime/native/browser/package job or duplicate watcher.

[Source proof and acceptance limits](https://reasonmachines.com/agents/1f14fa82-4ec3-41fc-b085-32ec441b4228?page=ccd4f5a4-f1f1-4d6d-a1f5-dbdde0979153)
